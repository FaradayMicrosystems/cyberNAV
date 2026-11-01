// Road network: decodes the packed OSM extract into a routable directed graph with a
// spatial index for snapping GPS fixes and taps to the nearest road.
import { makeProjection, projectOnSegment, bearing, angleDiff } from "./geo.js";

export const ROAD_CLASS = { HIGHWAY: 0, MAJOR: 1, TERTIARY: 2, MINOR: 3 };
const CELL = 150; // metres per spatial-index cell

export class RoadNetwork {
  constructor(data) {
    const n = data.nodes.length / 2;
    this.attribution = data.attribution;
    this.names = data.names;
    this.lon = new Float64Array(n); this.lat = new Float64Array(n);
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (let i = 0; i < n; i++) {
      const lon = (data.nodes[2 * i] + data.origin[0]) / data.scale, lat = (data.nodes[2 * i + 1] + data.origin[1]) / data.scale;
      this.lon[i] = lon; this.lat[i] = lat;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    this.proj = makeProjection((minLon + maxLon) / 2, (minLat + maxLat) / 2);
    this.x = new Float64Array(n); this.y = new Float64Array(n);
    for (let i = 0; i < n; i++) { const [x, y] = this.proj.toXY(this.lon[i], this.lat[i]); this.x[i] = x; this.y[i] = y; }
    this.nodeCount = n;

    this.ways = data.ways.map(([nameId, cls, oneway, kmh, flags, nodes], id) => ({
      id, name: data.names[nameId], cls, oneway, kmh, signedLimit: !!(flags & 1), roundabout: !!(flags & 2),
      tunnel: !!(flags & 4), bridge: !!(flags & 8), nodes,
    }));
    for (const w of this.ways) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
      for (let i = 0; i < w.nodes.length; i++) {
        const a = w.nodes[i];
        if (this.x[a] < x0) x0 = this.x[a]; if (this.x[a] > x1) x1 = this.x[a];
        if (this.y[a] < y0) y0 = this.y[a]; if (this.y[a] > y1) y1 = this.y[a];
        if (i) len += Math.hypot(this.x[a] - this.x[w.nodes[i - 1]], this.y[a] - this.y[w.nodes[i - 1]]);
      }
      w.bbox = [x0, y0, x1, y1]; w.length = len;
    }
    this.bbox = [Math.min(...this.ways.map(w => w.bbox[0])), Math.min(...this.ways.map(w => w.bbox[1])),
      Math.max(...this.ways.map(w => w.bbox[2])), Math.max(...this.ways.map(w => w.bbox[3]))];
    this.#buildGraph();
    this.#buildIndex();
  }

  /** Travel time in seconds for a segment of `len` metres on way w. */
  segmentTime(w, len) {
    // Urban roads rarely flow at the limit: scale by class to approximate signals and junctions.
    const factor = [0.9, 0.75, 0.7, 0.6][w.cls];
    return len / (w.kmh / 3.6 * factor);
  }

  #buildGraph() {
    const out = Array.from({ length: this.nodeCount }, () => []);
    this.edges = []; // { from, to, way, seg (index of from in way.nodes), forward, len, time }
    for (const w of this.ways) {
      for (let i = 0; i + 1 < w.nodes.length; i++) {
        const a = w.nodes[i], b = w.nodes[i + 1];
        const len = Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a]);
        const time = this.segmentTime(w, len);
        if (w.oneway !== -1) { out[a].push(this.edges.length); this.edges.push({ id: this.edges.length, from: a, to: b, way: w.id, seg: i, forward: true, len, time }); }
        if (w.oneway !== 1) { out[b].push(this.edges.length); this.edges.push({ id: this.edges.length, from: b, to: a, way: w.id, seg: i, forward: false, len, time }); }
      }
    }
    this.out = out;
    // Undirected degree tells guidance whether a node is a real junction.
    this.degree = new Uint8Array(this.nodeCount);
    for (const w of this.ways) for (let i = 0; i < w.nodes.length; i++) {
      const v = w.nodes[i];
      this.degree[v] = Math.min(255, this.degree[v] + (i === 0 || i === w.nodes.length - 1 ? 1 : 2));
    }
  }

  #buildIndex() {
    const [x0, y0, x1, y1] = this.bbox;
    this.gx0 = x0; this.gy0 = y0;
    this.gw = Math.ceil((x1 - x0) / CELL) + 1; this.gh = Math.ceil((y1 - y0) / CELL) + 1;
    this.cells = new Map();
    for (const w of this.ways) for (let i = 0; i + 1 < w.nodes.length; i++) {
      const a = w.nodes[i], b = w.nodes[i + 1];
      const cx0 = this.#cx(Math.min(this.x[a], this.x[b])), cx1 = this.#cx(Math.max(this.x[a], this.x[b]));
      const cy0 = this.#cy(Math.min(this.y[a], this.y[b])), cy1 = this.#cy(Math.max(this.y[a], this.y[b]));
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const k = cy * this.gw + cx;
        let list = this.cells.get(k); if (!list) this.cells.set(k, list = []);
        list.push(w.id, i);
      }
    }
  }
  #cx(x) { return Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.gx0) / CELL))); }
  #cy(y) { return Math.max(0, Math.min(this.gh - 1, Math.floor((y - this.gy0) / CELL))); }

  /**
   * Nearest road segment to (x, y) within maxDist metres.
   * With `heading` (degrees), segments whose travel direction disagrees are penalised,
   * which keeps a car on its own carriageway at junctions and on dual roads.
   * Returns { way, seg, a, b, t, x, y, d, score } or null.
   */
  snap(x, y, { maxDist = 200, heading = null, filter = null } = {}) {
    let best = null;
    const r = Math.ceil(maxDist / CELL);
    const cx = Math.floor((x - this.gx0) / CELL), cy = Math.floor((y - this.gy0) / CELL);
    const seen = new Set();
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) continue;
      const list = this.cells.get(j * this.gw + i); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const wid = list[k], s = list[k + 1], key = wid * 100000 + s;
        if (seen.has(key)) continue; seen.add(key);
        const w = this.ways[wid];
        if (filter && !filter(w)) continue;
        const a = w.nodes[s], b = w.nodes[s + 1];
        const p = projectOnSegment(x, y, this.x[a], this.y[a], this.x[b], this.y[b]);
        if (p.d > maxDist) continue;
        let score = p.d;
        if (heading != null) {
          const hb = bearing(this.x[a], this.y[a], this.x[b], this.y[b]);
          const fwd = Math.abs(angleDiff(heading, hb)), back = Math.abs(angleDiff(heading, (hb + 180) % 360));
          const okF = w.oneway !== -1, okB = w.oneway !== 1;
          const best = Math.min(okF ? fwd : 999, okB ? back : 999);
          score += best > 90 ? 60 : best * 0.25;
        }
        if (!best || score < best.score) best = { way: wid, seg: s, a, b, t: p.t, x: p.x, y: p.y, d: p.d, score };
      }
    }
    return best;
  }

  /** Ways whose bounding box intersects [x0, y0, x1, y1]. */
  waysIn(x0, y0, x1, y1) {
    return this.ways.filter(w => w.bbox[2] >= x0 && w.bbox[0] <= x1 && w.bbox[3] >= y0 && w.bbox[1] <= y1);
  }

  /** Outgoing edges at node v, optionally excluding u-turns back to `fromNode`. */
  outEdges(v) { return this.out[v].map(e => this.edges[e]); }
}
