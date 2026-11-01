// App controller: owns the map data, the navigation session, the location source and the
// demo drive. Phone UI, car surface and the head-unit mock all talk to this one object.
import demoData from "../data/network.js";
import { RoadNetwork } from "../core/network.js";
import { NavigationSession, State } from "../core/session.js";
import { PlaceIndex } from "../core/search.js";
import { SimulatedDriver } from "../core/drive.js";
import { BuildingSet } from "../core/buildings.js";
import { fetchRoads, fetchBuildings, searchPlaces, fetchCorridor } from "../core/online.js";
import { carTemplate } from "../core/templates.js";

export const DEMO_START = { lon: 11.9737, lat: 57.7089, label: "GÖTEBORG CENTRAL" };
const host = globalThis.CyberNavHost; // Android bridge, when running inside the app

export class Controller {
  constructor({ mode = "browser" } = {}) {
    this.mode = mode;               // browser | phone | car
    this.listeners = new Set();
    this.log = [];
    this.source = "demo";           // demo | live
    this.muted = false; this.simSpeed = 4; this.simNoise = 0;
    this.carUi = { screen: "map", query: "", results: [] };
    this.loadNetwork(demoData, "demo");
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(what = "state") {
    for (const fn of this.listeners) { try { fn(what); } catch (e) { console.error(e); } }
    if (host?.postState) { try { host.postState(JSON.stringify(this.carModel())); } catch { /* bridge gone */ } }
  }
  note(text, level = "") {
    const d = new Date();
    this.log.unshift({ text, level, time: d.toTimeString().slice(0, 8) });
    this.log.length = Math.min(this.log.length, 40);
    this.changed("log");
  }

  loadNetwork(data, source) {
    const t0 = performance.now();
    this.net = new RoadNetwork(data);
    this.places = new PlaceIndex(this.net);
    this.source = source;
    this.session?.cancel();
    this.session = new NavigationSession(this.net);
    this.session.on(ev => this.#onSessionEvent(ev));
    this.buildings = null;
    this.stopDemo();
    this.loadMs = performance.now() - t0;
    this.changed("network");
  }

  #onSessionEvent(ev) {
    switch (ev.type) {
      case "voice": this.speak(ev.text); break;
      case "rerouting": this.rerouting = true; this.changed(); break;
      case "rerouted": this.rerouting = false; this.note(`REROUTED // ${(ev.distance / 1000).toFixed(1)} KM`, "caution"); break;
      case "error": this.rerouting = false; this.note(ev.message, "alert"); this.lastError = ev.message; break;
      case "signal": this.note(ev.lost ? "GPS SIGNAL LOST // DEAD RECKONING" : "GPS SIGNAL RESTORED", ev.lost ? "caution" : ""); break;
      case "state":
        if (ev.to === State.ARRIVED) { this.note(`ARRIVED // ${this.session.destination?.label ?? ""}`); }
        if (ev.to === State.NAVIGATING) this.note(`ROUTE LOCKED // ${this.session.destination?.label ?? ""}`);
        this.changed(); break;
      case "progress": case "position": this.changed("progress"); break;
    }
  }

  speak(text) {
    if (this.muted || !text) return;
    this.lastSpoken = text;
    if (host?.speak) { try { host.speak(text); return; } catch { /* fall through */ } }
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no TTS */ }
  }

  // ---------- location ----------
  /** Put the user at a lon/lat (demo start or a dropped pin) without GPS. */
  placeAt(lon, lat, t = this.#now()) {
    const [x, y] = this.net.proj.toXY(lon, lat);
    const s = this.net.snap(x, y, { maxDist: 500 });
    this.session.updateLocation({ x: s ? s.x : x, y: s ? s.y : y, t, accuracy: 5, speed: 0, heading: s ? undefined : 0 });
    this.changed("progress");
  }
  #now() { return performance.now() / 1000; }

  startGps() {
    if (!navigator.geolocation) { this.note("NO GPS ON THIS DEVICE", "alert"); return; }
    this.stopGps();
    this.gpsWatch = navigator.geolocation.watchPosition(p => this.#onGps(p), e => this.note(`GPS // ${e.message.toUpperCase()}`, "alert"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    this.gpsTimer = setInterval(() => this.session.tick(this.#now()), 1000);
    this.note("GPS // ACQUIRING");
  }
  stopGps() { if (this.gpsWatch != null) navigator.geolocation.clearWatch(this.gpsWatch); clearInterval(this.gpsTimer); this.gpsWatch = null; }

  async #onGps(p) {
    const { latitude: lat, longitude: lon, accuracy, speed, heading } = p.coords;
    this.lastGps = { lat, lon };
    if (this.source !== "live") return;
    if (!this.liveLoaded) {
      // First fix: use cached roads if we have them for here, then download fresh ones.
      if (this.#loadCache(lat, lon)) { this.#feed(lat, lon, accuracy, speed, heading); return; }
      // The car screen runs its own copy of the app: give the phone's download a head start
      // so both don't hit the map server at once, then use what it saved.
      if (this.mode === "car" && Date.now() < (this.holdUntil ?? 0)) return;
      if (!this.loadingArea && !this.retryTimer) await this.loadLiveArea(lat, lon);
      return;
    }
    // Refetch when the car nears the edge of the loaded area (at most once a minute).
    const navigating = this.session.state === State.NAVIGATING;
    if (!this.loadingArea && Date.now() - (this.lastAreaTry ?? 0) > 60000 && this.#outsideData(lon, lat, navigating ? 150 : 800)) {
      this.loadLiveArea(lat, lon);
    }
    this.#feed(lat, lon, accuracy, speed, heading);
  }
  #feed(lat, lon, accuracy, speed, heading) {
    const [x, y] = this.net.proj.toXY(lon, lat);
    this.session.updateLocation({ x, y, t: this.#now(), accuracy, speed: speed ?? null, heading: Number.isFinite(heading) ? heading : null });
  }
  #outsideData(lon, lat, m = 800) {
    const [x, y] = this.net.proj.toXY(lon, lat), b = this.net.bbox;
    return x < b[0] + m || x > b[2] - m || y < b[1] + m || y > b[3] - m;
  }

  /** Switch to live mode: real GPS, roads and buildings downloaded around the user. */
  async goLive() {
    this.stopDemo();
    this.source = "live";
    if (!this.liveLoaded) {
      this.chart = { status: "gps" };
      this.session.cancel();
    }
    this.holdUntil = Date.now() + 15000;
    this.note("LIVE MODE // WAITING FOR GPS FIX");
    this.changed();
    this.startGps();
  }

  /**
   * Download roads around lat/lon. The first load is staged so the map appears fast:
   * every street within 1.5 km first (small, a few seconds), then a wider area
   * (all streets within 3 km, main roads within 9 km), then 3D buildings.
   * With dest, downloads a corridor to a far destination and plans the route.
   */
  async loadLiveArea(lat, lon, dest = null) {
    clearTimeout(this.retryTimer); this.retryTimer = null;
    this.loadingArea = true; this.lastAreaTry = Date.now();
    if (!this.liveLoaded) this.chart = { status: "loading", text: "ROADS WITHIN 1.5 KM" };
    this.note(dest ? "RECEIVING ROUTE CORRIDOR NOW." : "RECEIVING CHART DATA NOW.");
    this.changed();
    const apply = data => {
      // Keep the trip the user has going right now (it may have started while downloading).
      const st = this.session.state;
      const keep = dest ?? (st === State.NAVIGATING || st === State.PREVIEW ? this.#destLonLat() : null);
      const wasNavigating = st === State.NAVIGATING;
      dest = null;
      this.loadNetwork(data, "live");
      this.liveLoaded = true; this.chart = null; this.chartFailures = 0;
      const g = this.lastGps ?? { lat, lon };
      this.placeAt(g.lon, g.lat);
      if (keep) {
        const [x, y] = this.net.proj.toXY(keep.lon, keep.lat);
        if (this.route({ x, y, name: keep.name }) && wasNavigating) this.start();
      }
    };
    try {
      if (dest) {
        apply(await fetchCorridor({ lat, lon }, dest));
        this.note(`ROUTE CORRIDOR LOADED // ${this.net.ways.length} ROADS`);
      } else {
        const first = !this.liveLoaded;
        if (first) {
          apply(await fetchRoads(lat, lon, { near: 1500, timeoutMs: 25000 }));
          this.note(`CHART DATA // ${this.net.ways.length} ROADS NEARBY`);
        }
        try {
          const wide = await fetchRoads(lat, lon, { near: 3000, far: 9000, timeoutMs: 45000 });
          apply(wide); this.#saveCache(wide, lat, lon);
          this.note(`CHART DATA COMPLETE // ${this.net.ways.length} ROADS`);
        } catch (e) {
          if (!first) throw e;
          this.note("WIDE AREA DOWNLOAD FAILED // NEARBY ROADS ONLY", "caution");
        }
      }
      this.loadingArea = false;
      const g = this.lastGps ?? { lat, lon };
      this.#loadBuildings(g.lat, g.lon);
      return true;
    } catch (e) {
      const msg = String(e.message || e).toUpperCase();
      this.note(`MAP DOWNLOAD FAILED // ${msg}`, "alert");
      if (!this.liveLoaded) {
        this.chartFailures = (this.chartFailures ?? 0) + 1;
        const wait = Math.min(60, 10 * this.chartFailures);
        this.chart = { status: "failed", text: msg, retryAt: Date.now() + wait * 1000 };
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.retryChart(); }, wait * 1000);
      }
      return false;
    } finally { this.loadingArea = false; this.changed(); }
  }
  /** Retry the first live download now (button on the "no chart" panel). */
  retryChart() {
    const g = this.lastGps;
    if (this.source !== "live" || this.loadingArea) return;
    if (!g) { this.chart = { status: "gps" }; this.changed(); return; }
    this.loadLiveArea(g.lat, g.lon);
  }
  #destLonLat() {
    const d = this.session.destination; if (!d) return null;
    const [lon, lat] = this.net.proj.toLonLat(d.x, d.y);
    return { lon, lat, name: d.label };
  }

  // Roads from the last wide download, kept on the device so restarts (and the car screen,
  // which runs its own copy of the app) show the map at once. One area, up to 7 days old.
  #saveCache(data, lat, lon) {
    try { localStorage.setItem("cybernav.area", JSON.stringify({ lat, lon, t: Date.now(), data })); }
    catch { try { localStorage.removeItem("cybernav.area"); } catch { /* no storage */ } }
  }
  #loadCache(lat, lon) {
    try {
      const c = JSON.parse(localStorage.getItem("cybernav.area") || "null");
      if (!c || Date.now() - c.t > 7 * 864e5) return false;
      const d = Math.hypot((c.lat - lat) * 111320, (c.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180));
      if (d > 2000) return false;
      this.loadNetwork(c.data, "live");
      this.liveLoaded = true; this.chart = null;
      this.note(`CHART DATA // ${this.net.ways.length} ROADS FROM DEVICE`);
      this.placeAt(lon, lat);
      this.#loadBuildings(lat, lon);
      return true;
    } catch { return false; }
  }

  goDemo() {
    this.stopGps();
    clearTimeout(this.retryTimer); this.retryTimer = null;
    this.chart = null; this.liveLoaded = false;
    this.loadNetwork(demoData, "demo");
    this.placeAt(DEMO_START.lon, DEMO_START.lat);
    this.note(`DEMO MODE // ${DEMO_START.label}`);
    this.#loadBuildings(DEMO_START.lat, DEMO_START.lon);
  }

  async #loadBuildings(lat, lon) {
    const [x, y] = this.net.proj.toXY(lon, lat);
    this.buildings = BuildingSet.placeholder(this.net, x, y, 1500);
    this.changed("buildings");
    if (globalThis.CYBERNAV_OFFLINE) return;
    try {
      const raw = await fetchBuildings(lat, lon, 1500, { timeoutMs: 20000 });
      if (raw.length) { this.buildings = BuildingSet.fromOSM(raw, this.net.proj); this.note(`3D BUILDINGS // ${raw.length} LOADED`); this.changed("buildings"); }
    } catch { this.note("3D BUILDINGS // OFFLINE, USING PLACEHOLDERS", "caution"); }
  }

  // ---------- search and routing ----------
  async search(query) {
    const p = this.session.position ?? { x: 0, y: 0 };
    const noChart = this.source === "live" && this.chart;
    const local = noChart ? [] : this.places.search(query, { x: p.x, y: p.y, limit: 6 }).map(r => ({ ...r, detail: r.kind === "street" ? "STREET" : "COORDINATES" }));
    let online = [];
    if (query.trim().length >= 3 && !globalThis.CYBERNAV_OFFLINE) {
      try {
        const [lon, lat] = this.net.proj.toLonLat(p.x, p.y);
        online = (await searchPlaces(query, lat, lon, { limit: 5 })).map(r => {
          const [x, y] = this.net.proj.toXY(r.lon, r.lat);
          const inData = !this.#outsideData(r.lon, r.lat, 300);
          return { ...r, x, y, distance: Math.hypot(x - p.x, y - p.y), inData, detail: inData ? r.detail : `${r.detail} · FETCH ROUTE` };
        }).filter(r => r.inData || (this.source === "live" && r.distance < 60000));
      } catch { /* offline: local results only */ }
    }
    const seen = new Set(), out = [];
    for (const r of [...online, ...local]) { const k = r.name.toUpperCase(); if (seen.has(k)) continue; seen.add(k); out.push(r); }
    return out.slice(0, 6);
  }

  route(dest) {
    this.lastError = null;
    // A live search result outside the loaded roads: download a corridor first, then plan.
    if (dest.inData === false && dest.lat != null && this.source === "live" && this.session.position) {
      const [lon, lat] = this.net.proj.toLonLat(this.session.position.x, this.session.position.y);
      this.loadLiveArea(lat, lon, { lat: dest.lat, lon: dest.lon, name: dest.name });
      return false;
    }
    if (this.source === "live" && this.chart) { this.note("NO CHART DATA YET // WAIT FOR THE MAP TO LOAD", "caution"); return false; }
    if (!this.session.position) this.placeAt(DEMO_START.lon, DEMO_START.lat);
    const ok = this.session.setDestination({ x: dest.x, y: dest.y, label: dest.name ?? dest.label ?? "DROPPED PIN" });
    this.changed();
    return ok;
  }
  selectRoute(i) { this.session.selectRoute(i); this.changed(); }
  start() { const ok = this.session.start(); if (ok && this.source === "demo" && this.autoDrive !== false) this.startDemo(); this.changed(); return ok; }
  end() { this.stopDemo(); this.session.cancel(); this.rerouting = false; this.changed(); }
  setAvoidMotorways(on) { this.session.setAvoidMotorways(on); this.changed(); }
  toggleMute() { this.muted = !this.muted; if (this.muted) try { speechSynthesis.cancel(); } catch { /* none */ } this.changed(); }

  // ---------- demo drive ----------
  startDemo() {
    if (this.session.state !== State.NAVIGATING) return;
    this.stopDemo();
    this.driver = new SimulatedDriver(this.session, { noise: this.simNoise, seed: Math.floor(Math.random() * 1e6) });
    this.driver.t = this.session.lastFix?.t ?? this.#now();
    this.demoTimer = setInterval(() => {
      if (!this.driver) return;
      this.driver.step(1);
      if (this.driver.done || this.session.state !== State.NAVIGATING) this.stopDemo();
    }, 1000 / this.simSpeed);
    this.changed();
  }
  stopDemo() { clearInterval(this.demoTimer); this.demoTimer = null; this.driver?.dispose(); this.driver = null; this.changed?.(); }
  get demoActive() { return !!this.demoTimer; }
  setSimSpeed(x) { this.simSpeed = x; if (this.demoActive) { this.stopDemo(); this.startDemo(); } this.changed(); }
  /** Make the demo driver miss the next maneuver. */
  injectWrongTurn() {
    if (!this.driver) return;
    const next = this.session.nextManeuver(); if (!next) return;
    const idx = this.driver.maneuvers.findIndex(m => m.index === next.index && m.at === next.at);
    if (idx >= 0) { this.driver.wrongTurnsLeft.add(idx); this.note("SIM // WRONG TURN AT NEXT JUNCTION", "caution"); }
  }
  injectDropout(seconds = 12) { if (!this.driver) return; this.driver.o.dropouts.push([this.driver.t, this.driver.t + seconds]); this.note(`SIM // GPS DROPOUT ${seconds} S`, "caution"); }
  injectJump() { if (!this.driver) return; this.driver.o.jumps.push(this.driver.t + 1); this.note("SIM // GPS JUMP 670 M", "caution"); }
  setNoise(m) { this.simNoise = m; if (this.driver) this.driver.o.noise = m; this.changed(); }

  // ---------- car (Android Auto) ----------
  carModel() { return carTemplate(this.session.snapshot(), { ...this.carUi, muted: this.muted, rerouting: this.rerouting, demoActive: this.demoActive, error: this.lastError }); }

  /** Actions from the car host (Android Auto) or the head-unit mock. */
  async carAction(id, arg) {
    if (id === "search") { this.carUi = { screen: "search", query: "", results: [] }; }
    else if (id === "searchText") { this.carUi = { ...this.carUi, query: arg, searching: true }; this.changed(); this.carUi = { ...this.carUi, results: arg ? await this.search(arg) : [], searching: false }; }
    else if (id.startsWith("result:")) { const r = this.carUi.results[+id.split(":")[1]]; this.carUi = { screen: "map", query: "", results: [] }; if (r) this.route(r); }
    else if (id === "back") { this.carUi = { screen: "map", query: "", results: [] }; }
    else if (id.startsWith("route:")) this.selectRoute(+id.split(":")[1]);
    else if (id === "start") this.start();
    else if (id === "cancel" || id === "end" || id === "done") this.end();
    else if (id === "mute") this.toggleMute();
    else if (id === "demo") { if (this.demoActive) this.stopDemo(); else this.#demoTrip(); }
    this.changed();
  }

  /** One-tap demo for the car: route to a fixed destination and drive. */
  #demoTrip() {
    if (this.source !== "demo") this.goDemo();
    if (!this.session.position) this.placeAt(DEMO_START.lon, DEMO_START.lat);
    const dest = this.places.search("Linnégatan")[0] ?? this.places.streets[0];
    if (this.route(dest)) this.start();
  }
}
