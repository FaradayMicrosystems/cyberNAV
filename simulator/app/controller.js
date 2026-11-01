// App controller: owns the map data, the navigation session, the location source and the
// demo drive. Phone UI, car surface and the head-unit mock all talk to this one object.
import demoData from "../data/network.js";
import { RoadNetwork } from "../core/network.js";
import { NavigationSession, State } from "../core/session.js";
import { PlaceIndex } from "../core/search.js";
import { SimulatedDriver } from "../core/drive.js";
import { BuildingSet } from "../core/buildings.js";
import { fetchRoads, fetchBuildings, searchPlaces } from "../core/online.js";
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
    if (this.source === "live" && this.#outsideData(lon, lat) && !this.loadingArea) { await this.loadLiveArea(lat, lon); }
    if (this.source !== "live") return;
    const [x, y] = this.net.proj.toXY(lon, lat);
    this.session.updateLocation({ x, y, t: this.#now(), accuracy, speed: speed ?? null, heading: Number.isFinite(heading) ? heading : null });
  }
  #outsideData(lon, lat) {
    const [x, y] = this.net.proj.toXY(lon, lat), b = this.net.bbox, m = 800;
    return x < b[0] + m || x > b[2] - m || y < b[1] + m || y > b[3] - m;
  }

  /** Switch to live mode: real GPS, roads and buildings downloaded around the user. */
  async goLive() {
    this.stopDemo();
    this.source = "live"; this.changed();
    this.note("LIVE MODE // WAITING FOR GPS FIX");
    this.startGps();
  }

  async loadLiveArea(lat, lon) {
    this.loadingArea = true; this.changed();
    this.note("RECEIVING CHART DATA NOW.");
    try {
      const data = await fetchRoads(lat, lon, 6000);
      this.loadNetwork(data, "live");
      this.note(`CHART DATA COMPLETE // ${data.ways.length} ROADS`);
      this.placeAt(lon, lat);
      this.#loadBuildings(lat, lon);
    } catch (e) {
      this.note(`MAP DOWNLOAD FAILED // ${String(e.message || e).toUpperCase()}`, "alert");
    } finally { this.loadingArea = false; this.changed(); }
  }

  goDemo() {
    this.stopGps();
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
    const local = this.places.search(query, { x: p.x, y: p.y, limit: 6 }).map(r => ({ ...r, detail: r.kind === "street" ? "STREET" : "COORDINATES" }));
    let online = [];
    if (query.trim().length >= 3 && !globalThis.CYBERNAV_OFFLINE) {
      try {
        const [lon, lat] = this.net.proj.toLonLat(p.x, p.y);
        online = (await searchPlaces(query, lat, lon, { limit: 5 })).map(r => {
          const [x, y] = this.net.proj.toXY(r.lon, r.lat);
          return { ...r, x, y, distance: Math.hypot(x - p.x, y - p.y), inData: !this.#outsideData(r.lon, r.lat) };
        }).filter(r => r.inData);
      } catch { /* offline: local results only */ }
    }
    const seen = new Set(), out = [];
    for (const r of [...online, ...local]) { const k = r.name.toUpperCase(); if (seen.has(k)) continue; seen.add(k); out.push(r); }
    return out.slice(0, 6);
  }

  route(dest) {
    this.lastError = null;
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
