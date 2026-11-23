// 3D building models for the wireframe layer. Real footprints come from OpenStreetMap
// (online.js); without a connection, placeholder blocks are generated along streets so
// the 3D view still has something to show. Placeholders are flagged and labelled on screen.
import { rng, projectOnSegment } from "./geo.js";

export class BuildingSet {
  /** list: [{ pts: [[x, y]...] (metres, closed ring without repeat), h, min }] */
  constructor(list, { placeholder = false, source = "" } = {}) {
    this.placeholder = placeholder; this.source = source;
    this.items = list.filter(b => b.pts.length >= 3).map(b => {
      let cx = 0, cy = 0, r = 0;
      for (const [x, y] of b.pts) { cx += x; cy += y; }
      cx /= b.pts.length; cy /= b.pts.length;
      for (const [x, y] of b.pts) r = Math.max(r, Math.hypot(x - cx, y - cy));
      return { ...b, cx, cy, r, ccw: signedArea(b.pts) > 0 };
    });
    this.cell = 200; this.grid = new Map();
    this.items.forEach((b, i) => { const k = this.#key(b.cx, b.cy); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(i); });
  }
  #key(x, y) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`; }

  /** Buildings whose centre lies within `radius` of (x, y). */
  near(x, y, radius) {
    const out = [], c = this.cell, r = Math.ceil(radius / c);
    const gx = Math.floor(x / c), gy = Math.floor(y / c);
    for (let i = gx - r; i <= gx + r; i++) for (let j = gy - r; j <= gy + r; j++) {
      const list = this.grid.get(`${i},${j}`); if (!list) continue;
      for (const k of list) { const b = this.items[k]; if (Math.hypot(b.cx - x, b.cy - y) <= radius) out.push(b); }
    }
    return out;
  }

  static fromOSM(raw, proj, source = "OpenStreetMap") {
    const list = raw.map(b => {
      const pts = b.ring.map(([lon, lat]) => proj.toXY(lon, lat));
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return { pts, h: b.h, min: b.min || 0 };
    });
    return new BuildingSet(list, { source });
  }

  /** Placeholder blocks lining the streets within `radius` of (x0, y0). Deterministic. */
  static placeholder(net, x0, y0, radius = 1600, seed = 11) {
    const rand = rng(seed), list = [], taken = new Set();
    const cellKey = (x, y) => `${Math.floor(x / 14)},${Math.floor(y / 14)}`;
    for (const w of net.waysIn(x0 - radius, y0 - radius, x0 + radius, y0 + radius)) {
      if (w.cls === 0 || w.tunnel || w.bridge) continue;
      for (let i = 0; i + 1 < w.nodes.length; i++) {
        const a = w.nodes[i], b = w.nodes[i + 1];
        const ax = net.x[a], ay = net.y[a], bx = net.x[b], by = net.y[b];
        const len = Math.hypot(bx - ax, by - ay); if (len < 20) continue;
        const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
        for (let s = 8; s + 12 < len; s += 16 + rand() * 10) {
          for (const side of [-1, 1]) {
            if (rand() < 0.25) continue;
            const depth = 10 + rand() * 12, width = 10 + rand() * 8, off = 9 + (w.cls <= 1 ? 6 : 0);
            const px = ax + ux * s + nx * side * (off + depth / 2), py = ay + uy * s + ny * side * (off + depth / 2);
            if (Math.hypot(px - x0, py - y0) > radius) continue;
            const k = cellKey(px, py); if (taken.has(k)) continue;
            const hit = net.snap(px, py, { maxDist: Math.max(depth, width) / 2 + 4 });
            if (hit) continue; // would sit on another road
            taken.add(k);
            const hw = width / 2, hd = depth / 2;
            const corner = (u, v) => [px + ux * u + nx * v, py + uy * u + ny * v];
            const central = Math.max(0, 1 - Math.hypot(px - x0, py - y0) / radius);
            const h = 7 + rand() * 10 + central * central * 40 * rand();
            list.push({ pts: [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)], h, min: 0 });
          }
        }
      }
    }
    return new BuildingSet(list, { placeholder: true, source: "PLACEHOLDER BLOCKS" });
  }
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
export { projectOnSegment };
