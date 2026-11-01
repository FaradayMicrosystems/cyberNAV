// Phone UI in the Phosphor HUD style: boot sequence, search, route preview, turn-by-turn,
// status bar, settings and the demo-drive console.
import { State } from "../core/session.js";
import { glyphFor, instruction, formatDistance } from "../core/guidance.js";
import { MapView } from "./view.js";

const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clockTime = d => d.toTimeString().slice(0, 5);
export const fmtMin = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} MIN` : `${Math.floor(m / 60)} H ${m % 60} MIN`; };

export class PhoneUI {
  constructor(root, ctl, { boot = true } = {}) {
    this.ctl = ctl;
    this.el = h(`<div class="app ph-screen" data-testid="phone">
      <canvas class="map" aria-label="Map"></canvas>
      <div class="attrib"></div>
      <header class="topbar ph-panel" data-part="top">
        <div class="topbar__row"><div class="brand">CYBERNAV<small>// NAV PLOT</small></div>
          <span class="ph-btn ph-btn--live" aria-pressed="true" data-ref="mode" style="cursor:default">DEMO</span>
          <span class="clock num" data-ref="clock">--:--</span>
          <button class="ph-btn" data-act="settings" aria-expanded="false" aria-label="Settings">≡</button></div>
        <form class="search-row" data-ref="form" autocomplete="off">
          <input class="ph-input" data-ref="q" type="search" placeholder="SEARCH PLACE, STREET OR COORDS" aria-label="Search">
          <button class="ph-btn" type="submit" aria-label="Search">▸</button></form>
      </header>
      <section class="ph-panel ph-panel--drop drop results hidden" data-ref="results" aria-label="Search results"></section>
      <section class="ph-panel ph-panel--drop drop settings hidden" data-ref="settings" aria-label="Settings"></section>
      <section class="ph-panel turn hidden" data-ref="turn" aria-live="polite"></section>
      <div class="banner hidden" data-ref="banner"></div>
      <section class="ph-panel sheet hidden" data-ref="sheet"></section>
      <div class="mapbtns">
        <button class="ph-btn" data-act="zoomIn" aria-label="Zoom in">+</button>
        <button class="ph-btn" data-act="zoomOut" aria-label="Zoom out">−</button>
        <button class="ph-btn" data-act="tilt" aria-label="Toggle 3D">3D</button>
        <button class="ph-btn" data-act="recenter" aria-label="Recenter">◎</button>
      </div>
      <footer class="ph-status statusbar" data-ref="status"></footer>
      <section class="ph-screen ph-boot boot" data-ref="boot" aria-label="Loading">
        <div class="ph-boot__head"><div><div class="ph-boot__title">CYBERNAV</div><div class="ph-boot__sub">CHART ACQUISITION // REGIONAL ROAD NETWORK</div></div>
        <div class="ph-boot__prog"><span class="ph-cap">Tiles acquired</span><span class="ph-boot__pct num" data-ref="pct">0 / 48</span><div class="ph-bar"><i data-ref="fill" style="width:0"></i></div></div></div>
        <pre class="ph-boot__log" data-ref="log"></pre>
      </section>
    </div>`);
    root.append(this.el);
    this.ref = Object.fromEntries([...this.el.querySelectorAll("[data-ref]")].map(n => [n.dataset.ref, n]));
    this.view = new MapView(this.el.querySelector("canvas"), ctl);
    this.view.onTap = (x, y) => this.#tap(x, y);
    this.#bind();
    ctl.on(what => this.render(what));
    setInterval(() => { this.ref.clock.textContent = clockTime(new Date()); this.#status(); }, 1000);
    if (boot) this.#boot(); else this.ref.boot.classList.add("hidden");
    this.render();
  }

  #boot() {
    const lines = ["NOW ENTERING GRID SECTOR 57N 011E.", "RECEIVING CHART DATA NOW.", "PRIMARY REFERENCE  CURRENT POSITION",
      `ROADS ........ ${this.ctl.net.ways.length}`, "BUILDINGS .... 3D WIREFRAME", "GUIDANCE ..... ARMED", "CHART DATA COMPLETE // 48 TILES", "NAV PLOT LIVE"];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let n = 0, i = 0;
    const step = () => {
      n = Math.min(48, n + 4);
      this.ref.pct.textContent = `${n} / 48`; this.ref.fill.style.width = `${n / 48 * 100}%`;
      while (i < lines.length && i < Math.ceil(n / 6)) this.ref.log.textContent += lines[i++] + "\n";
      if (n < 48) setTimeout(step, reduce ? 0 : 110);
      else setTimeout(() => { this.ref.boot.classList.add("done"); setTimeout(() => this.ref.boot.classList.add("hidden"), 1500); }, reduce ? 0 : 350);
    };
    step();
  }

  #bind() {
    const ctl = this.ctl;
    this.ref.form.addEventListener("submit", e => { e.preventDefault(); this.#search(this.ref.q.value); });
    let timer;
    this.ref.q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => this.#search(this.ref.q.value), 250); });
    this.ref.q.addEventListener("focus", () => { if (this.ref.q.value) this.ref.results.classList.remove("hidden"); });
    this.el.addEventListener("click", e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const act = b.dataset.act, arg = b.dataset.arg;
      switch (act) {
        case "zoomIn": this.view.zoomBy(1.5); break;
        case "zoomOut": this.view.zoomBy(1 / 1.5); break;
        case "tilt": this.view.toggleTilt(); break;
        case "recenter": this.view.userZoom = false; this.view.recenter(); break;
        case "pick": this.#pick(+arg); break;
        case "route": ctl.selectRoute(+arg); break;
        case "start": this.view.userZoom = false; this.view.recenter(); ctl.start(); break;
        case "cancel": case "end": case "done": ctl.end(); this.view.recenter(); break;
        case "mute": ctl.toggleMute(); break;
        case "settings": this.#toggleSettings(); break;
        case "theme": this.#theme(arg); break;
        case "live": ctl.goLive(); this.#toggleSettings(false); break;
        case "demo": ctl.goDemo(); this.#toggleSettings(false); break;
        case "avoid": ctl.setAvoidMotorways(!ctl.session.avoid.motorways); this.#renderSettings(); break;
        case "buildings": this.view.r.showBuildings = !this.view.r.showBuildings; this.#renderSettings(); break;
        case "drive": ctl.demoActive ? ctl.stopDemo() : ctl.startDemo(); break;
        case "speed": ctl.setSimSpeed(+arg); break;
        case "wrong": ctl.injectWrongTurn(); break;
        case "dropout": ctl.injectDropout(12); break;
        case "jump": ctl.injectJump(); break;
        case "noise": ctl.setNoise(ctl.simNoise ? 0 : 12); this.#renderSettings(); break;
        case "pinroute": this.#routePin(); break;
      }
    });
  }

  async #search(q) {
    const box = this.ref.results;
    if (!q.trim()) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = `<div class="ph-panel__title">RESULTS // ${esc(q.toUpperCase())}</div><div class="empty">SCANNING…</div>`;
    const token = this.searchToken = Symbol();
    const results = await this.ctl.search(q);
    if (token !== this.searchToken) return;
    this.results = results;
    box.innerHTML = `<div class="ph-panel__title">RESULTS // ${esc(q.toUpperCase())}</div>` + (results.length
      ? `<ul>${results.map((r, i) => `<li><button class="result" data-act="pick" data-arg="${i}"><span>${esc(r.name)}</span><small>${esc(r.detail ?? "")} · ${formatDistance(r.distance ?? 0)}</small></button></li>`).join("")}</ul>`
      : `<div class="empty">NO MATCH IN LOADED CHART. TRY A STREET NAME, OR TAP THE MAP.</div>`);
  }

  #pick(i) {
    const r = this.results?.[i]; if (!r) return;
    this.ref.results.classList.add("hidden"); this.ref.q.value = r.name; this.ref.q.blur();
    this.view.pins = null;
    if (this.ctl.route(r)) this.view.fitRoutes();
  }

  #tap(x, y) {
    const s = this.ctl.session;
    if (s.state === State.NAVIGATING) return;
    this.ref.results.classList.add("hidden");
    if (s.state === State.PREVIEW) return;
    const snap = this.ctl.net.snap(x, y, { maxDist: 150 });
    if (!snap) return;
    this.pin = { x, y, name: this.ctl.net.ways[snap.way].name || "DROPPED PIN" };
    this.view.pins = [this.pin];
    this.render();
  }
  #routePin() { if (this.pin && this.ctl.route(this.pin)) { this.view.pins = null; this.pin = null; this.view.fitRoutes(); } }

  #toggleSettings(force) {
    const open = force ?? this.ref.settings.classList.contains("hidden");
    this.ref.settings.classList.toggle("hidden", !open);
    this.el.querySelector('[data-act="settings"]').setAttribute("aria-expanded", String(open));
    if (open) this.#renderSettings();
  }
  #renderSettings() {
    const c = this.ctl, cur = document.documentElement.dataset.phosphor || "nostromo";
    const on = v => v ? `aria-pressed="true"` : `aria-pressed="false"`;
    this.ref.settings.innerHTML = `<div class="ph-panel__title">SYSTEM // SETTINGS</div>
      <div class="grid">
        <span class="ph-cap">Data</span><div class="ph-seg"><button class="ph-btn" data-act="demo" ${on(c.source === "demo")}>Demo city</button><button class="ph-btn" data-act="live" ${on(c.source === "live")}>Live GPS</button></div>
        <span class="ph-cap">Phosphor</span><div class="ph-seg">${["nostromo", "amber", "ice", "white"].map(t => `<button class="ph-btn" data-act="theme" data-arg="${t}" ${on(cur === t)}>${t === "nostromo" ? "Green" : t}</button>`).join("")}</div>
        <span class="ph-cap">Avoid</span><button class="ph-btn" data-act="avoid" ${on(c.session.avoid.motorways)}>Motorways</button>
        <span class="ph-cap">Map</span><button class="ph-btn" data-act="buildings" ${on(this.view.r.showBuildings)}>3D buildings</button>
        <span class="ph-cap">Sim GPS</span><button class="ph-btn" data-act="noise" ${on(c.simNoise > 0)}>Noise 12 m</button>
      </div>
      <div class="empty">DEMO CITY: GÖTEBORG, BUNDLED, WORKS OFFLINE. LIVE GPS: YOUR LOCATION, DOWNLOADS ROADS AND BUILDINGS FROM OPENSTREETMAP.</div>`;
  }
  #theme(t) {
    if (t === "nostromo") delete document.documentElement.dataset.phosphor; else document.documentElement.dataset.phosphor = t;
    try { localStorage.setItem("cybernav.phosphor", t); } catch { /* private mode */ }
    this.view.refreshTheme(); this.ctl.changed("theme"); this.#renderSettings();
  }

  render() {
    const c = this.ctl, s = c.session, snap = s.snapshot();
    this.ref.mode.textContent = c.loadingArea ? "LOADING" : c.source === "live" ? "LIVE" : "DEMO";
    this.el.querySelector(".attrib").textContent = c.net.attribution;
    const nav = s.state === State.NAVIGATING;
    this.el.querySelector('[data-part="top"]').classList.toggle("hidden", nav || s.state === State.ARRIVED);
    if (nav || s.state === State.ARRIVED) this.ref.results.classList.add("hidden");

    // Turn panel
    const turn = this.ref.turn;
    turn.classList.toggle("hidden", !nav);
    if (nav && snap.next) {
      const m = s.nextManeuver(), after = s.maneuvers[s.maneuvers.indexOf(m) + 1];
      turn.innerHTML = `<div class="turn__glyph" aria-hidden="true">${glyphFor(m)}</div>
        <div class="turn__dist num" data-testid="turn-distance">${c.rerouting ? "REROUTING" : snap.next.distanceText}</div>
        <div class="turn__text" data-testid="turn-text">${esc(instruction(m))}</div>
        ${after ? `<div class="turn__then">THEN ${glyphFor(after)} ${esc(instruction(after))}</div>` : ""}`;
    }
    // Banner
    const b = this.ref.banner;
    const banner = s.signalLost ? ["GPS SIGNAL LOST // DEAD RECKONING", "caution"] : c.rerouting ? ["REROUTING", "caution"] : c.loadingArea ? ["RECEIVING CHART DATA", ""] : null;
    b.classList.toggle("hidden", !banner);
    if (banner) { b.textContent = banner[0]; b.className = `banner ${banner[1]}`; }

    // Bottom sheet
    const sh = this.ref.sheet;
    let sheet = "";
    if (s.state === State.PREVIEW) {
      const now = Date.now();
      sheet = `<div class="ph-panel__title">ROUTE PLOT // ${esc((snap.destination || "").toUpperCase())}</div>
        ${snap.routes.map(r => `<button class="route-opt" data-act="route" data-arg="${r.index}" aria-pressed="${r.index === snap.selected}" data-testid="route-${r.index}">
          <b class="num">${fmtMin(r.duration)}</b><em class="num">${formatDistance(r.distance)}</em>
          <span>${r.index === 0 ? "FASTEST · " : ""}VIA ${esc((r.via.join(" + ") || "LOCAL ROADS").toUpperCase())}</span><em class="num">ETA ${clockTime(new Date(now + r.duration * 1000))}</em></button>`).join("")}
        <div class="row"><button class="ph-btn big-btn grow" data-act="start" aria-pressed="true" data-testid="start">▸ START</button><button class="ph-btn big-btn" data-act="cancel" aria-label="Cancel route">✕</button></div>`;
    } else if (nav) {
      sheet = `<div class="navbar"><div class="eta num" data-testid="eta">${clockTime(new Date(Date.now() + snap.remainingSeconds * 1000))}
          <small>${fmtMin(snap.remainingSeconds)} · ${formatDistance(snap.remainingMeters)}</small></div>
        <div class="row"><button class="ph-btn" data-act="mute" aria-pressed="${c.muted}">${c.muted ? "MUTED" : "VOICE"}</button><button class="ph-btn ph-btn--alert" data-act="end" data-testid="end">END</button></div></div>
        ${c.source === "demo" ? `<div class="row"><span class="ph-cap">SIM</span>
          <button class="ph-btn ph-btn--live" data-act="drive" aria-pressed="${c.demoActive}">${c.demoActive ? "DRIVING" : "DRIVE"}</button>
          <div class="ph-seg">${[1, 4, 10].map(x => `<button class="ph-btn" data-act="speed" data-arg="${x}" aria-pressed="${c.simSpeed === x}">×${x}</button>`).join("")}</div>
          <button class="ph-btn" data-act="wrong">WRONG TURN</button><button class="ph-btn" data-act="dropout">GPS DROP</button><button class="ph-btn" data-act="jump">GPS JUMP</button></div>` : ""}`;
    } else if (s.state === State.ARRIVED) {
      sheet = `<div class="ph-panel__title">ARRIVED // ${esc((snap.destination || "").toUpperCase())}</div>
        <div class="row"><span class="grow ph-cap">REROUTES ${snap.rerouteCount}</span><button class="ph-btn big-btn" data-act="done" aria-pressed="true" data-testid="done">DONE</button></div>`;
    } else if (this.pin) {
      sheet = `<div class="ph-panel__title">PIN // ${esc(this.pin.name.toUpperCase())}</div>
        <div class="row"><button class="ph-btn big-btn grow" data-act="pinroute" aria-pressed="true">▸ ROUTE HERE</button><button class="ph-btn big-btn" data-act="cancel" aria-label="Clear pin">✕</button></div>`;
    }
    if (s.state !== State.IDLE) this.pin = null;
    sh.classList.toggle("hidden", !sheet);
    if (sh.dataset.html !== sheet) { sh.innerHTML = sheet; sh.dataset.html = sheet; }
    this.#status();
  }

  #status() {
    const c = this.ctl, s = c.session, snap = s.snapshot();
    const kmh = Math.round((s.position?.speed ?? 0) * 3.6);
    const gps = c.source === "demo" ? (c.demoActive ? 5 : 4) : s.signalLost ? 0 : s.position ? Math.max(1, 5 - Math.floor((s.position.accuracy ?? 50) / 15)) : 0;
    const cells = n => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    const html = `<span class="speed num"><span class="k">SPD</span>${kmh} KM/H</span>
      ${snap.speedLimit ? `<span class="num"><span class="k">LIMIT</span><span class="limit">${snap.speedLimit}</span></span>` : ""}
      <span class="ph-meter ${gps <= 1 ? "ph-meter--caution" : ""}" role="img" aria-label="GPS ${gps} of 5">GPS&nbsp;${cells(gps)}</span>
      <span class="help">${esc((snap.street || "").toUpperCase())}</span>`;
    if (this.ref.status.dataset.html !== html) { this.ref.status.innerHTML = html; this.ref.status.dataset.html = html; }
  }
}
