// Shared map view: renderer + camera behaviour (follow during guidance, free pan otherwise)
// + gestures. Used by the phone UI and the car surface.
import { MapRenderer, readTheme } from "../core/render.js";
import { State } from "../core/session.js";

export class MapView {
  constructor(canvas, ctl, { car = false } = {}) {
    this.ctl = ctl; this.car = car;
    this.r = new MapRenderer(canvas, { car });
    this.r.setTheme(readTheme());
    this.follow = true; this.tilt3d = true;
    this.display = null; // smoothed position for drawing
    this.#bindGestures(canvas);
    const frame = () => { try { this.tick(); } catch (e) { console.error(e); } requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }
  refreshTheme() { this.r.setTheme(readTheme()); }

  fitRoutes() {
    const s = this.ctl.session;
    const pts = [];
    for (const r of s.routes) for (let i = 0; i < r.coords.length; i += 4) pts.push(r.coords[i]);
    if (s.position) pts.push([s.position.x, s.position.y]);
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cam = this.r.cam, w = this.r.w || 400, h = this.r.h || 700;
    cam.x = (Math.min(...xs) + Math.max(...xs)) / 2; cam.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max((Math.max(...xs) - Math.min(...xs)) / (w * (this.car ? 0.5 : 0.8)), (Math.max(...ys) - Math.min(...ys)) / (h * (this.car ? 0.7 : 0.45)), 1 / 3);
    cam.zoom = 1 / span; cam.bearing = 0; cam.pitch = 0; cam.anchorY = this.car ? 0.5 : 0.48;
    if (this.car) cam.x -= (w * 0.18) / cam.zoom; // keep the route clear of the host's list card
    this.follow = false;
  }
  recenter() { this.follow = true; }
  zoomBy(f) { const c = this.r.cam; c.zoom = Math.max(0.03, Math.min(12, c.zoom * f)); this.userZoom = true; }
  toggleTilt() { this.tilt3d = !this.tilt3d; }

  tick() {
    const ctl = this.ctl, s = ctl.session, cam = this.r.cam;
    if (!this.r.w && !this.r.canvas.isConnected) return;
    const noChart = ctl.source === "live" && ctl.chart; // never show the demo city as if it were here
    this.r.net = noChart ? null : ctl.net; this.r.buildings = noChart ? null : ctl.buildings;
    // Smooth the displayed position between 1 Hz fixes.
    const p = s.position;
    if (p) {
      if (!this.display || Math.hypot(p.x - this.display.x, p.y - this.display.y) > 300) this.display = { ...p };
      const k = 0.12;
      this.display.x += (p.x - this.display.x) * k; this.display.y += (p.y - this.display.y) * k;
      const dh = ((p.heading - this.display.heading + 540) % 360) - 180;
      this.display.heading = (this.display.heading + dh * k + 360) % 360;
      this.display.accuracy = p.accuracy;
    }
    const nav = s.state === State.NAVIGATING || s.state === State.ARRIVED;
    if (this.follow && this.display) {
      const targetPitch = nav && this.tilt3d ? 55 : 0;
      const targetBearing = nav ? this.display.heading : 0;
      cam.x = this.display.x; cam.y = this.display.y;
      cam.pitch += (targetPitch - cam.pitch) * 0.08;
      const db = ((targetBearing - cam.bearing + 540) % 360) - 180; cam.bearing = (cam.bearing + db * 0.1 + 360) % 360;
      if (!this.userZoom) { const tz = nav ? (this.car ? 1.5 : 1.3) : 0.7; cam.zoom += (tz - cam.zoom) * 0.08; }
      cam.anchorY = nav ? (this.car ? 0.68 : 0.7) : 0.5;
    }
    this.r.draw({
      position: this.display, signalLost: s.signalLost,
      routes: s.state === State.PREVIEW ? s.routes : [], selectedRoute: s.selected,
      activeRoute: nav ? s.route : null, progress: s.progress,
      nextManeuver: nav ? s.nextManeuver() : null,
      destination: s.destination?.snap ? { x: s.destination.x, y: s.destination.y } : null,
      pins: this.pins,
    });
  }

  #bindGestures(el) {
    const pts = new Map(); let last = null, lastDist = null, moved = 0;
    el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; last = null; lastDist = null; });
    el.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const list = [...pts.values()];
      if (list.length === 1) {
        const [x, y] = list[0];
        if (last) { this.pan(x - last[0], y - last[1]); moved += Math.abs(x - last[0]) + Math.abs(y - last[1]); }
        last = [x, y];
      } else if (list.length === 2) {
        const d = Math.hypot(list[0][0] - list[1][0], list[0][1] - list[1][1]);
        if (lastDist) this.zoomBy(d / lastDist);
        lastDist = d; moved += 10;
      }
    });
    const up = e => {
      const wasTap = pts.size === 1 && moved < 6;
      pts.delete(e.pointerId); last = null; lastDist = null;
      if (wasTap && this.onTap) {
        const rect = el.getBoundingClientRect();
        const g = this.r.cam.unproject(e.clientX - rect.left, e.clientY - rect.top);
        if (g) this.onTap(g[0], g[1]);
      }
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", e => { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }

  /** Pan by screen pixels (also called by the Android Auto host's scroll callback). */
  pan(dx, dy) {
    const c = this.r.cam; this.follow = false;
    const b = c.bearing * Math.PI / 180, z = c.zoom * Math.max(0.3, c.cp ?? 1);
    const u = -dx / z, v = dy / z;
    c.x += u * Math.cos(b) + v * Math.sin(b); c.y += -u * Math.sin(b) + v * Math.cos(b);
  }
}
