// Entry point. Picks the layout:
//   ?mode=phone  phone app only (what the Android app shows on the phone)
//   ?mode=car    car map surface only (what the Android app draws on the Android Auto screen)
//   default      desktop simulator: phone + head-unit mock side by side
import { Controller, DEMO_START } from "./controller.js";
import { PhoneUI } from "./phone.js";
import { CarSurface, HeadUnitMock } from "./car.js";

try { const t = localStorage.getItem("cybernav.phosphor"); if (t && t !== "nostromo") document.documentElement.dataset.phosphor = t; } catch { /* no storage */ }

const params = new URLSearchParams(location.search);
const host = globalThis.CyberNavHost;
const mode = params.get("mode") || (host?.mode ? host.mode() : "sim");
if (params.has("offline")) globalThis.CYBERNAV_OFFLINE = true;
const root = document.getElementById("root");
const ctl = new Controller({ mode });
// Start: Android passes ?live=1 when location permission is granted; browsers start in demo.
if (params.get("live") === "1") ctl.goLive(); else ctl.goDemo();
globalThis.cybernav = { ctl };

if (mode === "phone") {
  const ui = new PhoneUI(root, ctl, { boot: !["", "1", "true"].includes(params.get("noboot") ?? "x") });
  globalThis.cybernav.phone = ui;
} else if (mode === "car") {
  const surface = new CarSurface(root, ctl);
  // API for the Android Auto host side (Kotlin calls these through evaluateJavascript).
  Object.assign(globalThis.cybernav, {
    surface,
    action: (id, arg) => ctl.carAction(id, arg),
    mapAction: id => surface.mapAction(id),
    pan: (dx, dy) => surface.view.pan(dx, dy),
    zoom: f => surface.view.zoomBy(f),
    stableArea: (l, t, r, b) => surface.setStableArea(l, t, r, b),
    model: () => JSON.stringify(ctl.carModel()),
  });
} else {
  root.innerHTML = `<div class="sim" data-tab="phone">
    <header class="sim__head"><span class="sim__title">CYBERNAV // SIMULATOR</span>
      <span class="sim__sub">PHONE + ANDROID AUTO · ONE SHARED NAV SESSION · DEMO CITY GÖTEBORG</span>
      <span class="ph-seg sim__tabs"><button class="ph-btn" data-tab="phone" aria-pressed="true">Phone</button><button class="ph-btn" data-tab="car" aria-pressed="false">Car</button></span></header>
    <div class="phone-col"><p class="device-label">PHONE</p><div class="phone-frame" id="phone"></div></div>
    <div class="car-col"><p class="device-label">ANDROID AUTO HEAD UNIT</p><div class="car-frame" id="car"></div>
      <div class="console"><section class="ph-panel"><div class="ph-panel__title">EVENT LOG</div><ol class="ph-log" id="log"></ol></section>
      <section class="ph-panel"><div class="ph-panel__title">HOW TO TRY IT</div><p class="sim__sub" style="line-height:1.6;letter-spacing:.06em">
        SEARCH A STREET (TRY "LINNÉGATAN") OR TAP THE MAP, PICK A ROUTE, PRESS START. THE DEMO CAR DRIVES ITSELF.
        USE WRONG TURN, GPS DROP AND GPS JUMP TO TEST REROUTING. THE CAR SCREEN'S SEARCH AND DEMO DRIVE BUTTONS WORK TOO.</p></section></div></div></div>`;
  const sim = root.firstElementChild;
  globalThis.cybernav.phone = new PhoneUI(sim.querySelector("#phone"), ctl, { boot: !["", "1", "true"].includes(params.get("noboot") ?? "x") });
  globalThis.cybernav.car = new HeadUnitMock(sim.querySelector("#car"), ctl);
  sim.querySelector(".sim__tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    sim.dataset.tab = b.dataset.tab;
    sim.querySelectorAll(".sim__tabs .ph-btn").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });
  const log = sim.querySelector("#log");
  ctl.on(what => {
    if (what !== "log" && log.childElementCount) return;
    log.innerHTML = ctl.log.slice(0, 14).map(l => `<li class="${l.level}"><b>${l.text}</b><em>${l.time}</em></li>`).join("");
  });
}

export { ctl, DEMO_START };
