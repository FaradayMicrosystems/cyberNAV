// Simulated driver: follows the session's route and produces GPS fixes. Used by the demo
// drive in the app and by the test suite, with optional GPS noise, dropouts, jumps and
// deliberate wrong turns.
import { cumulative, pointAlong, bearing, angleDiff, rng, gauss } from "./geo.js";

export class SimulatedDriver {
  /**
   * opts: { seed, noise (m sigma), accuracy, wrongTurns: [maneuver indices on the first route],
   *         dropouts: [[t0, t1]], jumps: [t], speedFactor, rate (fixes per second) }
   */
  constructor(session, opts = {}) {
    this.session = session; this.net = session.net;
    this.o = { noise: 0, accuracy: 8, wrongTurns: [], dropouts: [], jumps: [], speedFactor: 1, rate: 1, seed: 7, ...opts };
    this.rand = rng(this.o.seed);
    this.t = session.lastFix?.t ?? 0;
    this.speed = 0; this.done = false; this.detouring = false;
    this.wrongTurnsLeft = new Set(this.o.wrongTurns);
    this.#follow(session.route);
    this.off = session.on(ev => { if (ev.type === "rerouted") { this.#follow(session.route); this.detouring = false; } });
  }
  dispose() { this.off?.(); }

  #follow(route) {
    if (!route) return;
    this.path = route.coords.map(c => c.slice()); this.cum = route.cum; this.s = 0;
    this.maneuvers = route.maneuvers ?? [];
    this.routeRef = route;
  }

  /** Build a detour that leaves the route at maneuver m and keeps driving for `len` metres. */
  #detour(m, len = 260) {
    const r = this.routeRef;
    const k = r.nodeIndex.indexOf(m.index);
    if (k < 0) return false;
    const v = r.nodes[k], prevV = r.nodes[k - 1], nextV = r.nodes[k + 1];
    const inH = bearing(this.net.x[prevV ?? v], this.net.y[prevV ?? v], this.net.x[v], this.net.y[v]);
    const options = this.net.outEdges(v).filter(e => e.to !== prevV && e.to !== nextV);
    if (!options.length) return false;
    // Prefer going straight on when the route turns, otherwise the gentlest wrong option.
    options.sort((a, b) => Math.abs(angleDiff(inH, bearing(this.net.x[v], this.net.y[v], this.net.x[a.to], this.net.y[a.to])))
      - Math.abs(angleDiff(inH, bearing(this.net.x[v], this.net.y[v], this.net.x[b.to], this.net.y[b.to]))));
    const coords = [[this.net.x[v], this.net.y[v]]];
    let e = options[0], travelled = 0, from = v;
    const seen = new Set([v]);
    while (e && travelled < len) {
      coords.push([this.net.x[e.to], this.net.y[e.to]]); travelled += e.len; seen.add(e.to);
      const h = bearing(this.net.x[e.from], this.net.y[e.from], this.net.x[e.to], this.net.y[e.to]);
      from = e.to;
      const nexts = this.net.outEdges(from).filter(n => !seen.has(n.to));
      nexts.sort((a, b) => Math.abs(angleDiff(h, bearing(this.net.x[from], this.net.y[from], this.net.x[a.to], this.net.y[a.to])))
        - Math.abs(angleDiff(h, bearing(this.net.x[from], this.net.y[from], this.net.x[b.to], this.net.y[b.to]))));
      e = nexts[0];
    }
    if (coords.length < 2) return false;
    this.path = coords; this.cum = cumulative(coords); this.s = 0; this.detouring = true; this.maneuvers = [];
    return true;
  }

  #targetSpeed() {
    const p = pointAlong(this.path, this.cum, this.s);
    const wid = this.routeRef && !this.detouring ? this.routeRef.ways[Math.min(p.i, this.routeRef.ways.length - 1)] : null;
    const w = wid != null ? this.net.ways[wid] : null;
    let v = (w ? w.kmh : 40) / 3.6 * 0.85;
    const m = this.maneuvers.find(mm => mm.at > this.s && mm.type !== "depart");
    if (m && m.at - this.s < 50 && Math.abs(m.angle) > 45) v = Math.min(v, 7);
    return v * this.o.speedFactor;
  }

  /** Advance dt seconds. Returns the fix emitted (or null during a dropout). */
  step(dt = 1) {
    if (this.done) return null;
    this.t += dt;
    const target = this.#targetSpeed();
    this.speed += Math.max(-4 * dt, Math.min(2.5 * dt, target - this.speed)); // accel / brake limits
    const before = this.s;
    this.s = Math.min(this.cum[this.cum.length - 1], this.s + this.speed * dt);
    // Deliberate wrong turn when passing a planned maneuver.
    if (!this.detouring && this.wrongTurnsLeft.size) {
      for (const mi of this.wrongTurnsLeft) {
        const m = this.maneuvers[mi];
        if (m && before <= m.at && this.s >= m.at && ["turn", "keep", "continue", "roundabout"].includes(m.type)) {
          this.wrongTurnsLeft.delete(mi);
          const over = this.s - m.at;
          if (this.#detour(m)) this.s = Math.min(over, this.cum[this.cum.length - 1]);
          break;
        }
      }
    }
    if (this.s >= this.cum[this.cum.length - 1] - 0.01 && (this.detouring || this.session.state !== "NAVIGATING")) this.speed = 0;
    const p = pointAlong(this.path, this.cum, this.s);
    this.truth = { x: p.x, y: p.y, heading: p.heading };
    if (this.session.state === "ARRIVED") { this.done = true; }
    if (this.o.dropouts.some(([a, b]) => this.t >= a && this.t < b)) { this.session.tick(this.t); return null; }
    let x = p.x + gauss(this.rand) * this.o.noise, y = p.y + gauss(this.rand) * this.o.noise;
    if (this.o.jumps.some(j => Math.abs(this.t - j) < dt / 2)) { x += 600; y += 300; }
    const fix = { x, y, t: this.t, speed: this.speed, heading: this.speed > 1 ? p.heading : null, accuracy: Math.max(this.o.accuracy, this.o.noise * 1.5) };
    this.session.updateLocation(fix);
    return fix;
  }

  /** Run until arrival or `maxSeconds`. Returns the elapsed simulated seconds. */
  run(maxSeconds = 7200, dt = 1) {
    const t0 = this.t;
    while (!this.done && this.t - t0 < maxSeconds) {
      this.step(dt);
      if (this.detouring && this.s >= this.cum[this.cum.length - 1] - 0.01 && this.session.state === "NAVIGATING") {
        // Detour ran out and the session never rerouted: that is a failure, stop here.
        this.stuck = true; this.done = true;
      }
    }
    return this.t - t0;
  }
}
