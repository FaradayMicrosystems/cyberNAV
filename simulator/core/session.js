// Navigation session: the state machine every screen (phone, car, tests) drives.
//
//   IDLE ──setDestination──► PREVIEW ──start──► NAVIGATING ──arrive──► ARRIVED
//                              ▲                  │   ▲
//                              └──── cancel ◄─────┘   └── reroute (off route) ──┘
//
// Location input is a stream of fixes { x, y, heading?, speed?, accuracy?, t } in
// network metres (see RoadNetwork.proj) and seconds. The session map-matches each fix
// to the active route, detects leaving the route, reroutes, and tracks arrival.
import { projectOnSegment, pointAlong, dist, angleDiff, bearing } from "./geo.js";
import { alternatives, route as planRoute, summarize } from "./router.js";
import { buildManeuvers, instruction, spoken, formatDistance } from "./guidance.js";

export const State = { IDLE: "IDLE", PREVIEW: "PREVIEW", NAVIGATING: "NAVIGATING", ARRIVED: "ARRIVED" };

export const DEFAULTS = {
  offRouteMeters: 35,        // beyond this from the route (plus GPS error) counts as off route
  offRouteConfirm: 2,        // consecutive off-route fixes before rerouting
  maxAccuracy: 80,           // fixes worse than this are ignored (urban canyon, indoor)
  jumpSpeed: 70,             // m/s; faster apparent movement is a GPS jump (outlier)
  signalLostAfter: 6,        // seconds without a usable fix before showing SIGNAL LOST
  deadReckonMax: 45,         // seconds of dead reckoning at the last speed while signal is lost
  arriveMeters: 25,          // within this of the destination along the route
  rerouteCooldown: 4,        // seconds between reroutes
  announce: [800, 300, 60],  // metres before a maneuver when voice prompts fire
};

export class NavigationSession {
  constructor(net, opts = {}) {
    this.net = net;
    this.o = { ...DEFAULTS, ...opts };
    this.state = State.IDLE;
    this.listeners = new Set();
    this.routes = []; this.selected = 0; this.route = null; this.maneuvers = [];
    this.position = null; this.destination = null;
    this.progress = 0; this.offCount = 0; this.rerouteCount = 0; this.lastReroute = -Infinity;
    this.lastFix = null; this.signalLost = false; this.announced = new Set();
    this.avoid = { motorways: false };
    this.events = [];
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit(type, data = {}) {
    const ev = { type, t: this.lastFix?.t ?? 0, ...data };
    this.events.push(ev); if (this.events.length > 200) this.events.shift();
    for (const fn of this.listeners) { try { fn(ev, this); } catch (e) { console.error(e); } }
  }
  #setState(s) { if (this.state !== s) { const from = this.state; this.state = s; this.#emit("state", { from, to: s }); } }

  /** Current position snapped to a road, used as the start of a route. */
  #startSnap() {
    if (!this.position) return null;
    const p = this.position;
    const s = this.net.snap(p.x, p.y, { maxDist: 400, heading: p.speed > 2 ? p.heading : null });
    return s;
  }

  /** Choose a destination { x, y, label }. Plans up to three routes and enters PREVIEW. */
  setDestination(dest) {
    if (!this.position) { this.#emit("error", { code: "NO_POSITION", message: "WAITING FOR GPS" }); return false; }
    const to = this.net.snap(dest.x, dest.y, { maxDist: 400 });
    if (!to) { this.#emit("error", { code: "NO_ROAD", message: "NO ROAD NEAR DESTINATION" }); return false; }
    to.label = dest.label || ""; to.px = dest.x; to.py = dest.y;
    const from = this.#startSnap();
    if (!from) { this.#emit("error", { code: "OFF_NETWORK", message: "POSITION OUTSIDE MAP DATA" }); return false; }
    const heading = this.position.speed > 2 ? this.position.heading : null;
    const routes = alternatives(this.net, from, to, { heading, avoid: this.avoid }, 3);
    if (!routes.length) { this.#emit("error", { code: "NO_ROUTE", message: "NO ROUTE FOUND" }); return false; }
    this.destination = { ...dest, snap: to };
    this.routes = routes.map(r => this.#decorate(r));
    this.selected = 0;
    this.#setState(State.PREVIEW);
    this.#emit("routes", { count: this.routes.length });
    return true;
  }

  #decorate(r) {
    r.maneuvers = buildManeuvers(this.net, r);
    r.via = summarize(this.net, r);
    return r;
  }

  selectRoute(i) { if (this.state === State.PREVIEW && this.routes[i]) { this.selected = i; this.#emit("select", { index: i }); } }

  start() {
    if (this.state !== State.PREVIEW) return false;
    this.route = this.routes[this.selected];
    this.maneuvers = this.route.maneuvers;
    this.progress = 0; this.offCount = 0; this.announced = new Set(); this.rerouteCount = 0;
    this.#setState(State.NAVIGATING);
    this.#emit("voice", { text: spoken(this.maneuvers[0]) });
    this.#update(true);
    return true;
  }

  /** Stop navigating or previewing and return to IDLE. */
  cancel() {
    this.route = null; this.routes = []; this.maneuvers = []; this.destination = null;
    this.#setState(State.IDLE);
  }

  setAvoidMotorways(on) {
    this.avoid.motorways = !!on;
    if (this.state === State.PREVIEW && this.destination) this.setDestination(this.destination);
  }

  /** Feed one location fix. Returns false when the fix was rejected. */
  updateLocation(fix) {
    const f = { accuracy: 10, speed: null, heading: null, ...fix };
    if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.t)) return false;
    if (this.lastFix && f.t <= this.lastFix.t) return false; // stale or duplicate
    if (f.accuracy > this.o.maxAccuracy) { this.#emit("fix-rejected", { reason: "accuracy" }); this.tick(f.t); return false; }
    if (this.lastFix) {
      const dt = f.t - this.lastFix.t, d = dist(this.lastFix.x, this.lastFix.y, f.x, f.y);
      if (dt < 10 && d / dt > this.o.jumpSpeed && !this.pendingJump) {
        this.pendingJump = f; this.#emit("fix-rejected", { reason: "jump" }); this.tick(f.t); return false;
      }
    }
    // A jump confirmed by a second fix close to it is real (e.g. tunnel exit, GPS restart).
    this.pendingJump = null;
    if (f.heading == null && this.lastFix) {
      const d = dist(this.lastFix.x, this.lastFix.y, f.x, f.y);
      f.heading = d > 2 ? bearing(this.lastFix.x, this.lastFix.y, f.x, f.y) : this.position?.heading ?? 0;
    }
    if (f.speed == null) f.speed = this.lastFix ? dist(this.lastFix.x, this.lastFix.y, f.x, f.y) / Math.max(0.1, f.t - this.lastFix.t) : 0;
    if (f.speed < 1.5 && this.position) f.heading = this.position.heading; // stationary: heading is noise
    this.lastFix = f;
    if (this.signalLost) { this.signalLost = false; this.#emit("signal", { lost: false }); }
    this.position = { x: f.x, y: f.y, heading: f.heading ?? 0, speed: f.speed, accuracy: f.accuracy, t: f.t, raw: true };
    if (this.state === State.NAVIGATING) this.#update(false);
    else this.#emit("position");
    return true;
  }

  /** Advance time without a fix: signal-loss detection and dead reckoning. */
  tick(t) {
    if (!this.lastFix || this.state !== State.NAVIGATING) return;
    const gap = t - this.lastFix.t;
    if (gap >= this.o.signalLostAfter && !this.signalLost) { this.signalLost = true; this.#emit("signal", { lost: true }); }
    if (this.signalLost && gap <= this.o.deadReckonMax && this.route) {
      // Assume the car keeps going along the route at its last speed.
      const s = Math.min(this.route.distance, this.matched + this.lastFix.speed * gap);
      this.progress = Math.max(this.progress, s);
      const p = pointAlong(this.route.coords, this.route.cum, this.progress);
      this.position = { ...this.position, x: p.x, y: p.y, heading: p.heading, raw: false };
      this.#emit("progress", this.snapshot());
    }
  }

  /** Map-match the current position to the route and update progress, reroute, arrival. */
  #update(initial) {
    const r = this.route, p = this.position;
    if (!r || !p) return;
    // Search a window of the route around current progress so loops and parallel streets
    // on the same route do not confuse matching.
    const lo = Math.max(0, this.progress - 60), hi = initial ? Infinity : this.progress + 400 + p.speed * 10;
    let best = null;
    for (let i = 0; i + 1 < r.coords.length; i++) {
      if (r.cum[i + 1] < lo) continue; if (r.cum[i] > hi) break;
      const [ax, ay] = r.coords[i], [bx, by] = r.coords[i + 1];
      const q = projectOnSegment(p.x, p.y, ax, ay, bx, by);
      let score = q.d;
      if (p.speed > 3) { const dh = Math.abs(angleDiff(p.heading, bearing(ax, ay, bx, by))); if (dh > 100) score += 40; }
      if (!best || score < best.score) best = { ...q, i, s: r.cum[i] + q.t * (r.cum[i + 1] - r.cum[i]), score };
    }
    if (!best) return;
    const tolerance = this.o.offRouteMeters + Math.min(40, p.accuracy ?? 10);
    if (best.score > tolerance) {
      this.offCount++;
      this.#emit("off-route", { distance: Math.round(best.d), count: this.offCount });
      if (this.offCount >= this.o.offRouteConfirm && p.t - this.lastReroute >= this.o.rerouteCooldown) this.reroute();
      return;
    }
    this.offCount = 0;
    this.matched = best.s;
    this.progress = Math.max(this.progress - 30, best.s); // allow small backward corrections only
    this.progress = best.s;
    const remaining = r.distance - this.progress;
    // Arrival: close along the route, or past the destination's projection.
    if (remaining <= this.o.arriveMeters || (remaining < 60 && dist(p.x, p.y, ...r.coords[r.coords.length - 1]) < this.o.arriveMeters + 10)) {
      this.progress = r.distance;
      this.#setState(State.ARRIVED);
      this.#emit("voice", { text: `You have arrived${r.to?.label ? ` at ${r.to.label}` : ""}.` });
      return;
    }
    this.#announce();
    this.#emit("progress", this.snapshot());
  }

  /** Plan a new route from the current position to the same destination. */
  reroute() {
    if (!this.destination || !this.position) return false;
    const t = this.position.t ?? 0;
    this.lastReroute = t;
    this.#emit("rerouting");
    const from = this.net.snap(this.position.x, this.position.y, { maxDist: 400, heading: this.position.speed > 2 ? this.position.heading : null });
    const r = from && planRoute(this.net, from, this.destination.snap, { heading: this.position.speed > 2 ? this.position.heading : null, avoid: this.avoid });
    if (!r) { this.#emit("error", { code: "NO_ROUTE", message: "REROUTE FAILED // RETRYING" }); return false; }
    this.route = this.#decorate(r);
    this.maneuvers = this.route.maneuvers;
    this.progress = 0; this.matched = 0; this.offCount = 0; this.announced = new Set();
    this.rerouteCount++;
    this.#emit("rerouted", { count: this.rerouteCount, distance: Math.round(r.distance) });
    this.#emit("voice", { text: "Rerouting." });
    this.#update(true);
    return true;
  }

  #announce() {
    const m = this.nextManeuver(); if (!m) return;
    const d = m.at - this.progress;
    const speed = Math.max(8, this.position?.speed ?? 8);
    for (const threshold of this.o.announce) {
      const key = `${m.index}:${threshold}`;
      // Scale the earliest prompt with speed so highway prompts come early enough.
      const th = threshold === this.o.announce[0] ? Math.max(threshold, speed * 30) : threshold;
      if (d <= th && !this.announced.has(key)) {
        // Do not announce the far prompts when we are already close.
        for (const t2 of this.o.announce) if (t2 >= threshold) this.announced.add(`${m.index}:${t2}`);
        this.#emit("voice", { text: spoken(m, d > 80 ? d : null), maneuver: m.index });
        break;
      }
    }
  }

  nextManeuver() {
    if (!this.maneuvers.length) return null;
    return this.maneuvers.find(m => m.at > this.progress + 1 && m.type !== "depart") ?? this.maneuvers[this.maneuvers.length - 1];
  }

  /** Remaining time on the active route, proportional to segment travel times. */
  remainingTime() {
    const r = this.route; if (!r) return 0;
    let t = 0;
    for (let i = 0; i < r.segTime.length; i++) {
      const a = r.cum[i], b = r.cum[i + 1];
      if (b <= this.progress) continue;
      t += a >= this.progress ? r.segTime[i] : r.segTime[i] * (b - this.progress) / Math.max(0.01, b - a);
    }
    return t;
  }

  /** Current speed limit (km/h) on the matched road, if signposted. */
  speedLimit() {
    const r = this.route; if (!r) return null;
    const p = pointAlong(r.coords, r.cum, this.progress);
    const w = this.net.ways[r.ways[Math.min(p.i, r.ways.length - 1)]];
    return w?.signedLimit ? w.kmh : null;
  }

  currentStreet() {
    const r = this.route;
    if (r) { const p = pointAlong(r.coords, r.cum, this.progress); return this.net.ways[r.ways[Math.min(p.i, r.ways.length - 1)]]?.name || ""; }
    if (this.position) { const s = this.net.snap(this.position.x, this.position.y, { maxDist: 60 }); return s ? this.net.ways[s.way].name : ""; }
    return "";
  }

  /** Plain snapshot for screens and the Android Auto bridge. */
  snapshot() {
    const m = this.nextManeuver();
    const r = this.route;
    const remaining = r ? Math.max(0, r.distance - this.progress) : 0;
    const secs = this.remainingTime();
    return {
      state: this.state, signalLost: this.signalLost, rerouteCount: this.rerouteCount,
      position: this.position && { x: this.position.x, y: this.position.y, heading: this.position.heading, speed: this.position.speed },
      next: m && { type: m.type, modifier: m.modifier, exit: m.exit ?? null, street: m.street, distance: Math.max(0, m.at - this.progress),
        distanceText: formatDistance(Math.max(0, m.at - this.progress)), text: instruction(m) },
      remainingMeters: remaining, remainingSeconds: secs,
      speedLimit: this.speedLimit(), street: this.currentStreet(),
      destination: this.destination?.label ?? "",
      routes: this.routes.map((rt, i) => ({ index: i, distance: rt.distance, duration: rt.duration, via: rt.via })),
      selected: this.selected,
    };
  }
}
