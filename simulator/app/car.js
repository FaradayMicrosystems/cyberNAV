// Android Auto screen. CarSurface is what cyberNAV itself draws on the car's map surface.
// HeadUnitMock imitates what the Android Auto host draws on top (cards, buttons, lists) from
// the same template model the Android app sends, so the browser shows the whole car screen.
import { State } from "../core/session.js";
import { MapView } from "./view.js";
import { fmtMin } from "./phone.js";

const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class CarSurface {
  constructor(root, ctl) {
    this.ctl = ctl;
    this.el = h(`<div class="surface ph-screen" data-testid="car-surface"><canvas aria-label="Car map"></canvas>
      <div class="hud-line" data-ref="line">CYBERNAV // NAV PLOT LIVE</div>
      <div class="speedo num" data-ref="speedo"></div><div class="banner hidden" data-ref="banner"></div></div>`);
    root.append(this.el);
    this.ref = Object.fromEntries([...this.el.querySelectorAll("[data-ref]")].map(n => [n.dataset.ref, n]));
    this.view = new MapView(this.el.querySelector("canvas"), ctl, { car: true });
    this.view.tilt3d = true;
    ctl.on(() => this.render());
    this.render();
  }
  /** Area not covered by host UI, in px from each edge (from SurfaceCallback.onStableAreaChanged). */
  setStableArea(l, t, r, b) {
    const s = this.el.style; s.setProperty("--sl", `${l + 12}px`); s.setProperty("--sr", `${r + 12}px`); s.setProperty("--sb", `${b + 10}px`);
  }
  render() {
    const c = this.ctl, s = c.session, snap = s.snapshot();
    const kmh = Math.round((s.position?.speed ?? 0) * 3.6);
    this.ref.speedo.innerHTML = s.state === State.NAVIGATING ? `${kmh}<small>KM/H</small>${snap.speedLimit ? `<span class="limit">${snap.speedLimit}</span>` : ""}` : "";
    this.ref.line.textContent = s.state === State.NAVIGATING ? `CYBERNAV // ${(snap.street || "EN ROUTE").toUpperCase()}` : c.source === "live" ? "CYBERNAV // LIVE GPS" : "CYBERNAV // DEMO CITY";
    const banner = s.signalLost ? "GPS SIGNAL LOST" : c.rerouting ? "REROUTING" : null;
    this.ref.banner.classList.toggle("hidden", !banner);
    if (banner) { this.ref.banner.textContent = banner; this.ref.banner.className = "banner caution"; }
    if (s.state === State.PREVIEW && this.lastState !== State.PREVIEW) this.view.fitRoutes();
    if (s.state !== State.PREVIEW && this.lastState === State.PREVIEW) { this.view.userZoom = false; this.view.recenter(); }
    this.lastState = s.state;
  }
  mapAction(id) {
    if (id === "zoomIn") this.view.zoomBy(1.5);
    else if (id === "zoomOut") this.view.zoomBy(1 / 1.5);
    else if (id === "recenter") { this.view.userZoom = false; this.view.recenter(); }
    else if (id === "tilt") this.view.toggleTilt();
  }
}

const ICON = {
  DEPART: "▲", STRAIGHT: "▲", KEEP_LEFT: "◤", KEEP_RIGHT: "◥", TURN_SLIGHT_LEFT: "◤", TURN_SLIGHT_RIGHT: "◥",
  TURN_NORMAL_LEFT: "◀", TURN_NORMAL_RIGHT: "▶", TURN_SHARP_LEFT: "◣", TURN_SHARP_RIGHT: "◢", U_TURN_LEFT: "↶",
  ROUNDABOUT_ENTER_AND_EXIT_CCW: "⟲", DESTINATION: "◆", DESTINATION_LEFT: "◆", DESTINATION_RIGHT: "◆",
};

export class HeadUnitMock {
  constructor(frame, ctl) {
    this.ctl = ctl;
    this.el = h(`<div class="host" data-testid="car-host">
      <div class="host__rail" aria-hidden="true"><span data-ref="clock">--:--</span><i class="on">◆</i><i>♪</i><i>☎</i><i>▦</i></div>
      <div class="host__map" data-ref="map"></div><div class="host__ui" data-ref="ui"></div>
      <div class="host-tag">HEAD UNIT MOCK · grey UI = drawn by Android Auto</div></div>`);
    frame.append(this.el);
    this.ref = Object.fromEntries([...this.el.querySelectorAll("[data-ref]")].map(n => [n.dataset.ref, n]));
    this.surface = new CarSurface(this.ref.map, ctl);
    this.el.addEventListener("click", e => {
      const b = e.target.closest("[data-id]"); if (!b) return;
      const id = b.dataset.id;
      if (["zoomIn", "zoomOut", "recenter", "tilt"].includes(id)) this.surface.mapAction(id); else ctl.carAction(id);
    });
    this.el.addEventListener("input", e => { if (e.target.matches("[data-search]")) { clearTimeout(this.t); this.t = setTimeout(() => ctl.carAction("searchText", e.target.value), 250); } });
    ctl.on(() => this.render());
    setInterval(() => { this.ref.clock.textContent = new Date().toTimeString().slice(0, 5); }, 1000);
    this.render();
  }

  render() {
    const t = this.ctl.carModel(), ui = this.ref.ui;
    const btn = (a, cls = "") => `<button class="${cls}" data-id="${a.id}">${esc(a.title ?? a.icon)}</button>`;
    const mapStrip = a => a?.length ? `<div class="host-mapstrip">${a.map(x => `<button data-id="${x.id}" aria-label="${x.id}">${esc(x.icon)}</button>`).join("")}</div>` : "";
    let html = "";
    if (t.type === "search") {
      html = `<div class="host-search" style="left:7%"><div style="display:flex;gap:8px"><button data-id="back" aria-label="Back">←</button>
        <input data-search placeholder="${esc(t.hint)}" value="${esc(t.query)}" aria-label="Car search" style="flex:1"></div>
        <div class="host-list" style="position:static;width:auto;background:none;padding:0">${t.loading ? `<small style="color:#aaa">Searching…</small>` : ""}
        ${t.items.map(i => `<button class="item" data-id="${i.id}"><span>${esc(i.title)}</span><small>${esc(i.text)}</small></button>`).join("")}</div></div>`;
    } else if (t.type === "routePreview") {
      html = `<div class="host-list" style="left:calc(7% + 16px)"><h3>${esc(t.title)}</h3>
        ${t.items.map((i, k) => `<button class="item" data-id="${i.id}" aria-pressed="${k === t.selected}"><span>${esc(i.title)}</span><small>${esc(i.text)}</small></button>`).join("")}
        ${btn(t.navigateAction, "go")}</div>
        <div class="host-strip">${t.actionStrip.map(a => btn(a)).join("")}</div>${mapStrip(t.mapActionStrip)}`;
    } else {
      let card = "";
      if (t.routingInfo?.loading) card = `<div class="host-card" style="left:calc(7% + 16px)"><div class="host-card__turn"><div class="host-card__road">Rerouting…</div></div></div>`;
      else if (t.routingInfo) {
        const r = t.routingInfo, e = t.travelEstimate;
        const dist = r.distanceMeters < 1000 ? `${Math.max(10, Math.round(r.distanceMeters / 10) * 10)} m` : `${(r.distanceMeters / 1000).toFixed(1)} km`;
        card = `<div class="host-card" style="left:calc(7% + 16px)" data-testid="host-routing">
          <div class="host-card__turn"><svg class="host-card__icon" viewBox="0 0 48 48" aria-hidden="true"><text x="24" y="36" text-anchor="middle" font-size="34" fill="var(--phosphor)">${ICON[r.maneuver.type] ?? "▲"}</text>${r.maneuver.roundaboutExit ? `<text x="40" y="44" font-size="12" fill="#fff">${r.maneuver.roundaboutExit}</text>` : ""}</svg>
          <div><div class="host-card__dist">${dist}</div><div class="host-card__road">${esc(r.cue)}</div></div></div>
          <div class="host-card__est"><b>${new Date(e.arrivalEpochMs).toTimeString().slice(0, 5)}</b><span>${fmtMin(e.remainingSeconds).toLowerCase()}</span><span>${e.remainingMeters < 1000 ? e.remainingMeters + " m" : (e.remainingMeters / 1000).toFixed(1) + " km"}</span></div></div>`;
      } else if (t.message) card = `<div class="host-msg" style="left:calc(7% + 16px)"><h3>${esc(t.message.title)}</h3><div>${esc(t.message.text)}</div></div>`;
      html = `${card}<div class="host-strip">${(t.actionStrip ?? []).map((a, i) => btn(a, i === 0 && !t.routingInfo ? "primary" : "")).join("")}</div>${mapStrip(t.mapActionStrip)}`;
    }
    if (ui.dataset.html !== html) {
      const focused = document.activeElement?.matches?.("[data-search]");
      ui.innerHTML = html; ui.dataset.html = html;
      if (focused || t.type === "search") { const inp = ui.querySelector("[data-search]"); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
    }
  }
}
