// Phosphor HUD map renderer: canvas 2D with a perspective camera, so the same code draws
// the flat overview map and the tilted 3D driving view with wireframe buildings.
import { pointAlong } from "./geo.js";

const FOV = 50 * Math.PI / 180;

export function readTheme(el = document.documentElement) {
  const cs = getComputedStyle(el), v = n => cs.getPropertyValue(`--${n}`).trim();
  const names = ["ground", "phosphor", "ink-soft", "ink-muted", "line", "line-strong", "line-control", "line-faint", "map-grid-major",
    "map-grid-minor", "map-building", "map-building-edge", "map-road-minor", "map-road-major", "map-road-highway", "map-label",
    "map-route-alt", "signal-caution", "signal-alert", "fill-body", "font-data"];
  const t = {}; for (const n of names) t[n] = v(n);
  return t;
}

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.zoom = 0.6; this.bearing = 0; this.pitch = 0; this.anchorY = 0.5; }
  /** Prepare projection for a canvas of w × h CSS pixels. */
  setup(w, h) {
    this.w = w; this.h = h;
    this.F = (h / 2) / Math.tan(FOV / 2);
    this.D = this.F / this.zoom;
    const p = this.pitch * Math.PI / 180, b = this.bearing * Math.PI / 180;
    this.sp = Math.sin(p); this.cp = Math.cos(p); this.sb = Math.sin(b); this.cb = Math.cos(b);
    this.cx = w / 2; this.cy = h * this.anchorY;
  }
  /** World (x, y, z) to camera space [right, up, depth]. */
  toCam(x, y, z = 0) {
    const dx = x - this.x, dy = y - this.y;
    const u = dx * this.cb - dy * this.sb, v = dx * this.sb + dy * this.cb;
    const ry = v + this.D * this.sp, rz = z - this.D * this.cp;
    return [u, ry * this.cp + rz * this.sp, ry * this.sp - rz * this.cp];
  }
  toScreen(c) { return [this.cx + c[0] / c[2] * this.F, this.cy - c[1] / c[2] * this.F]; }
  project(x, y, z = 0) { const c = this.toCam(x, y, z); return c[2] < 1 ? null : this.toScreen(c); }
  /** Screen point to ground (z = 0) world coordinates, or null above the horizon. */
  unproject(sx, sy) {
    const dirU = (sx - this.cx) / this.F, dirY = -(sy - this.cy) / this.F; // ray in camera space with depth 1
    // camera-space basis back to (u, v, z): up = (0, cp, sp)... solve ray / ground intersection
    const camV = -this.D * this.sp, camZ = this.D * this.cp;
    const rv = dirY * this.cp + 1 * this.sp, rz = dirY * this.sp - 1 * this.cp;
    if (rz >= -1e-6) return null;
    const t = -camZ / rz;
    const u = dirU * t, v = camV + rv * t;
    return [this.x + u * this.cb + v * this.sb, this.y - u * this.sb + v * this.cb];
  }
  /** World bbox of the visible ground, capped at maxDist from the camera target. */
  visibleBox(maxDist = 3000) {
    const pts = [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h], [this.w / 2, 0]].map(([sx, sy]) => {
      let g = this.unproject(sx, sy);
      if (!g) { // above horizon: take the far cap in that direction
        const a = Math.atan2(sx - this.cx, 1) ; g = [this.x + maxDist * Math.sin(this.bearing * Math.PI / 180 + a * 0.6), this.y + maxDist * Math.cos(this.bearing * Math.PI / 180 + a * 0.6)];
      }
      const dx = g[0] - this.x, dy = g[1] - this.y, d = Math.hypot(dx, dy);
      return d > maxDist ? [this.x + dx / d * maxDist, this.y + dy / d * maxDist] : g;
    });
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  }
}

/** Draw a world polyline with near-plane clipping. coords: [[x, y], ...] */
function polyline(ctx, cam, coords, from = 0, to = coords.length - 1) {
  let prev = null, started = false;
  for (let i = from; i <= to; i++) {
    const c = cam.toCam(coords[i][0], coords[i][1]);
    if (prev) {
      let a = prev, b = c;
      if (a[2] < 1 && b[2] < 1) { started = false; prev = c; continue; }
      if (a[2] < 1) a = lerpNear(a, b);
      else if (b[2] < 1) b = lerpNear(a, b);
      const sa = cam.toScreen(a), sb = cam.toScreen(b);
      if (!started || a !== prev) { ctx.moveTo(sa[0], sa[1]); started = true; }
      ctx.lineTo(sb[0], sb[1]);
      if (b !== c) started = false;
    }
    prev = c;
  }
}
function lerpNear(a, b) { const t = (1 - a[2]) / (b[2] - a[2]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1]; }

export class MapRenderer {
  constructor(canvas, { car = false } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.cam = new Camera(); this.car = car;
    this.net = null; this.buildings = null; this.theme = null;
    this.showBuildings = true; this.labels = true;
    this.stats = { frameMs: 0, buildings: 0, ways: 0 };
  }
  setTheme(t) { this.theme = t; }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr; this.w = r.width; this.h = r.height;
  }

  /** scene: { session, routes, activeRoute, progress, position, destination, selectedRoute, notice } */
  draw(scene) {
    const t0 = performance.now();
    const { ctx, cam, theme: T, net } = this;
    if (!T) return;
    this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    cam.setup(this.w, this.h);
    ctx.fillStyle = T.ground; ctx.fillRect(0, 0, this.w, this.h);
    const box = cam.visibleBox(this.car ? 2200 : 4000);
    this.#grid(box);
    if (!net) { this.stats.ways = 0; return; } // no chart data yet: grid only
    const ways = net.waysIn(...box);
    this.stats.ways = ways.length;
    this.#roads(ways);
    if (this.showBuildings && this.buildings) this.#buildings(scene);
    this.#routes(scene);
    if (this.labels) this.#labels(ways, scene);
    this.#markers(scene);
    this.stats.frameMs = performance.now() - t0;
  }

  #grid(box) {
    const { ctx, cam, theme: T } = this;
    const step = cam.zoom > 0.25 ? 100 : 500;
    ctx.lineWidth = 1;
    for (const major of [false, true]) {
      const s = major ? step * 10 : step;
      if (!major && cam.zoom > 3) continue; // fade minor grid at street zoom
      ctx.strokeStyle = major ? T["map-grid-major"] : T["map-grid-minor"];
      ctx.beginPath();
      for (let x = Math.floor(box[0] / s) * s; x <= box[2]; x += s) polyline(ctx, cam, [[x, box[1]], [x, box[3]]]);
      for (let y = Math.floor(box[1] / s) * s; y <= box[3]; y += s) polyline(ctx, cam, [[box[0], y], [box[2], y]]);
      ctx.stroke();
    }
  }

  #roads(ways) {
    const { ctx, cam, theme: T, net } = this;
    const k = this.car ? 1.5 : 1;
    const styles = [
      [3, T["map-road-minor"], 1], [2, T["map-road-minor"], 1.2], [1, T["map-road-major"], 1.6], [0, T["map-road-highway"], 2.4],
    ];
    for (const [cls, color, width] of styles) {
      if (cls === 3 && cam.zoom < 0.12) continue;
      ctx.strokeStyle = color; ctx.lineWidth = width * k * (cam.zoom > 2 ? 1.6 : 1); ctx.setLineDash(cls === 0 && cam.zoom > 1.5 ? [] : []);
      ctx.beginPath();
      for (const w of ways) {
        if (w.cls !== cls) continue;
        const coords = w.nodes.map(n => [net.x[n], net.y[n]]);
        polyline(ctx, cam, coords);
      }
      ctx.stroke();
    }
  }

  #buildings(scene) {
    const { ctx, cam, theme: T } = this;
    const pos = scene.position ?? { x: cam.x, y: cam.y };
    const radius = (this.car ? 700 : 1200) / Math.max(0.5, Math.min(1, cam.zoom * 1.4));
    const list = this.buildings.near(cam.x, cam.y, Math.min(radius, 1800));
    if (cam.zoom < 0.18) { this.stats.buildings = 0; return; }
    // Camera position on the ground for painter's ordering.
    const camX = cam.x - cam.D * cam.sp * cam.sb, camY = cam.y - cam.D * cam.sp * cam.cb;
    list.sort((a, b) => Math.hypot(b.cx - camX, b.cy - camY) - Math.hypot(a.cx - camX, a.cy - camY));
    const flat = cam.pitch < 5;
    ctx.lineJoin = "miter";
    let drawn = 0;
    const face = "rgba(2,5,3,0.9)";
    for (const b of list) {
      const n = b.pts.length;
      const base = b.pts.map(([x, y]) => cam.toCam(x, y, b.min));
      if (base.some(c => c[2] < 1)) continue;
      const sb = base.map(c => cam.toScreen(c));
      if (sb.every(p => p[0] < -50 || p[0] > this.w + 50 || p[1] < -50 || p[1] > this.h + 50)) continue;
      drawn++;
      if (flat) {
        ctx.beginPath(); sb.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        ctx.fillStyle = T["map-building"]; ctx.fill(); ctx.strokeStyle = T["map-building-edge"]; ctx.lineWidth = 1; ctx.stroke();
        continue;
      }
      const roof = b.pts.map(([x, y]) => cam.toScreen(cam.toCam(x, y, b.h)));
      // Walls facing the camera (screen winding test), then the roof on top.
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = sb[i], c = sb[j];
        const cross = (c[0] - a[0]) * (roof[i][1] - a[1]) - (c[1] - a[1]) * (roof[i][0] - a[0]);
        if ((cross > 0) === b.ccw) continue;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(roof[j][0], roof[j][1]); ctx.lineTo(roof[i][0], roof[i][1]); ctx.closePath();
        ctx.fillStyle = face; ctx.fill(); ctx.strokeStyle = T["map-building-edge"]; ctx.stroke();
      }
      ctx.beginPath(); roof.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      ctx.fillStyle = face; ctx.fill();
      ctx.strokeStyle = b.h > 30 ? T["line-strong"] : T["line-control"]; ctx.stroke();
    }
    this.stats.buildings = drawn;
    if (this.buildings.placeholder && drawn) {
      ctx.font = `10px ${T["font-data"]}`; ctx.fillStyle = T["ink-muted"]; ctx.textAlign = this.car ? "center" : "right";
      ctx.fillText("BUILDINGS: PLACEHOLDER BLOCKS // LIVE DATA OFFLINE", this.car ? this.w / 2 : this.w - 10, this.h - (this.car ? 12 : 46));
      ctx.textAlign = "left";
    }
  }

  #routes(scene) {
    const { ctx, cam, theme: T } = this;
    const k = this.car ? 1.6 : 1;
    // Alternatives in preview.
    (scene.routes ?? []).forEach((r, i) => {
      if (i === scene.selectedRoute || scene.activeRoute) return;
      ctx.strokeStyle = T["map-route-alt"]; ctx.lineWidth = 1.3 * k * 1.5; ctx.setLineDash([4 * k, 5 * k]);
      ctx.beginPath(); polyline(ctx, cam, r.coords); ctx.stroke();
    });
    ctx.setLineDash([]);
    const r = scene.activeRoute ?? scene.routes?.[scene.selectedRoute];
    if (!r) return;
    const prog = scene.activeRoute ? scene.progress ?? 0 : 0;
    let split = 0; while (split + 1 < r.cum.length && r.cum[split + 1] <= prog) split++;
    const here = pointAlong(r.coords, r.cum, prog);
    const ahead = [[here.x, here.y], ...r.coords.slice(split + 1)];
    if (prog > 0) {
      ctx.strokeStyle = T["line-control"]; ctx.lineWidth = 2 * k; ctx.beginPath(); polyline(ctx, cam, [...r.coords.slice(0, split + 1), [here.x, here.y]]); ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = T.phosphor; ctx.shadowBlur = 8;
    ctx.strokeStyle = T.phosphor; ctx.lineWidth = 2.6 * k * (cam.zoom > 1.5 ? 1.5 : 1); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); polyline(ctx, cam, ahead); ctx.stroke();
    ctx.restore();
    // Next maneuver ring.
    const m = scene.nextManeuver;
    if (m && m.type !== "arrive") {
      const p = cam.project(m.x, m.y); if (p) { ctx.strokeStyle = T.phosphor; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], 7 * k, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  #labels(ways, scene) {
    const { ctx, cam, theme: T, net } = this;
    if (cam.zoom < 0.35) return;
    const placed = [], max = this.car ? 18 : 40;
    ctx.font = `${this.car ? 13 : 11}px ${T["font-data"]}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const sorted = ways.filter(w => w.name && w.length > 60).sort((a, b) => a.cls - b.cls || b.length - a.length);
    for (const w of sorted) {
      if (placed.length >= max) break;
      const mid = w.nodes[Math.floor(w.nodes.length / 2)];
      const c = cam.toCam(net.x[mid], net.y[mid]);
      if (c[2] < 1 || c[2] > cam.D * 2.2) continue;
      const [sx, sy] = cam.toScreen(c);
      if (sx < 40 || sx > this.w - 40 || sy < 30 || sy > this.h - 30) continue;
      const text = w.name.toUpperCase(), tw = ctx.measureText(text).width + 8, th = 14;
      const rect = [sx - tw / 2, sy - th / 2, sx + tw / 2, sy + th / 2];
      if (placed.some(p => rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1])) continue;
      placed.push(rect);
      ctx.fillStyle = "rgba(2,5,3,0.75)"; ctx.fillRect(rect[0], rect[1], tw, th);
      ctx.fillStyle = T["map-label"]; ctx.fillText(text, sx, sy + 1);
    }
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  #markers(scene) {
    const { ctx, cam, theme: T } = this;
    const k = this.car ? 1.5 : 1;
    const d = scene.destination;
    if (d) {
      const p = cam.project(d.x, d.y);
      if (p) {
        ctx.fillStyle = T.phosphor; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 7 * k); ctx.lineTo(p[0] + 7 * k, p[1]); ctx.lineTo(p[0], p[1] + 7 * k); ctx.lineTo(p[0] - 7 * k, p[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T.phosphor; ctx.lineWidth = 1.5; const s = 16 * k, e = 6 * k;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p[0] + sx * s, p[1] + sy * (s - e)); ctx.lineTo(p[0] + sx * s, p[1] + sy * s); ctx.lineTo(p[0] + sx * (s - e), p[1] + sy * s); }
        ctx.stroke();
      }
    }
    for (const pin of scene.pins ?? []) {
      const p = cam.project(pin.x, pin.y); if (!p) continue;
      ctx.fillStyle = T["ink-soft"]; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0] + 5, p[1]); ctx.lineTo(p[0], p[1] + 5); ctx.lineTo(p[0] - 5, p[1]); ctx.closePath(); ctx.fill();
    }
    const me = scene.position;
    if (me) {
      const p = cam.project(me.x, me.y);
      if (p) {
        const rel = ((me.heading ?? 0) - cam.bearing) * Math.PI / 180;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(rel);
        // flatten the chevron with pitch so it lies on the road
        ctx.scale(1, 1 - cam.sp * 0.35);
        ctx.shadowColor = scene.signalLost ? T["signal-caution"] : T.phosphor; ctx.shadowBlur = 18;
        ctx.fillStyle = scene.signalLost ? T["signal-caution"] : T.phosphor;
        const s = 9 * k;
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, s); ctx.lineTo(0, s * 0.45); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (me.accuracy > 25 && cam.pitch < 5) {
          ctx.strokeStyle = T["line"]; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], me.accuracy * cam.zoom, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
  }
}
