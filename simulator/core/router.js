// A* routing over the road graph, with alternatives by the penalty method.
import { dist, bearing, angleDiff, cumulative } from "./geo.js";

const MAX_SPEED = 130 / 3.6; // admissible heuristic: nothing in the extract is faster
const UTURN_START_PENALTY = 45; // seconds; discourages starting against the current heading
const TURN_PENALTY = { left: 8, right: 4, sharp: 12, uturn: 60 }; // seconds, applied at junctions

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/**
 * A routing endpoint: a point snapped onto a road segment (see RoadNetwork.snap).
 * Builds the virtual edges that connect the point to the segment's two nodes.
 */
function endpointLinks(net, snap, asStart) {
  const w = net.ways[snap.way];
  const ax = net.x[snap.a], ay = net.y[snap.a], bx = net.x[snap.b], by = net.y[snap.b];
  const toA = dist(snap.x, snap.y, ax, ay), toB = dist(snap.x, snap.y, bx, by);
  const links = [];
  // Travelling a->b along the way is "forward".
  const fwdOk = w.oneway !== -1, backOk = w.oneway !== 1;
  if (asStart) {
    if (fwdOk) links.push({ node: snap.b, len: toB, time: net.segmentTime(w, toB), heading: bearing(ax, ay, bx, by) });
    if (backOk) links.push({ node: snap.a, len: toA, time: net.segmentTime(w, toA), heading: bearing(bx, by, ax, ay) });
  } else {
    if (fwdOk) links.push({ node: snap.a, len: toA, time: net.segmentTime(w, toA) });
    if (backOk) links.push({ node: snap.b, len: toB, time: net.segmentTime(w, toB) });
  }
  return links;
}

function turnCost(net, inEdge, outEdge) {
  if (!inEdge) return 0;
  if (outEdge.to === inEdge.from && outEdge.way === inEdge.way) return TURN_PENALTY.uturn;
  if (net.degree[inEdge.to] <= 2) return 0;
  const h1 = bearing(net.x[inEdge.from], net.y[inEdge.from], net.x[inEdge.to], net.y[inEdge.to]);
  const h2 = bearing(net.x[outEdge.from], net.y[outEdge.from], net.x[outEdge.to], net.y[outEdge.to]);
  const a = angleDiff(h1, h2);
  if (Math.abs(a) > 150) return TURN_PENALTY.uturn;
  if (Math.abs(a) > 110) return TURN_PENALTY.sharp;
  if (a < -35) return TURN_PENALTY.left;
  if (a > 35) return TURN_PENALTY.right;
  return 0;
}

/**
 * Fastest route between two snapped points.
 * opts.heading: current travel direction at the start (degrees) to avoid needless U-turns.
 * opts.penalty: Map(edgeIndex -> multiplier) used to find alternatives.
 * opts.avoid: { motorways: bool }
 * Returns a Route or null when the destination cannot be reached.
 */
export function route(net, from, to, opts = {}) {
  if (!from || !to) return null;
  const startLinks = endpointLinks(net, from, true);
  const endLinks = endpointLinks(net, to, false);
  const sameSeg = from.way === to.way && from.seg === to.seg;
  const w = net.ways[from.way];

  // Direct route along the same segment.
  let direct = null;
  if (sameSeg) {
    const forward = to.t >= from.t;
    const ok = forward ? w.oneway !== -1 : w.oneway !== 1;
    if (ok) {
      const len = dist(from.x, from.y, to.x, to.y);
      direct = { cost: net.segmentTime(w, len) + headingPenalty(net, from, forward, opts.heading), len };
    }
  }

  const tx = to.x, ty = to.y;
  const g = new Map(), prev = new Map(), prevEdge = new Map();
  const heap = new Heap();
  for (const l of startLinks) {
    const c = l.time + (opts.heading != null && Math.abs(angleDiff(opts.heading, l.heading)) > 100 ? UTURN_START_PENALTY : 0);
    if (!g.has(l.node) || c < g.get(l.node)) { g.set(l.node, c); prev.set(l.node, -1); prevEdge.set(l.node, null); heap.push(c + dist(net.x[l.node], net.y[l.node], tx, ty) / MAX_SPEED, l.node); }
  }
  const endCost = new Map(endLinks.map(l => [l.node, l]));
  let best = direct ? direct.cost : Infinity, bestEnd = direct ? "direct" : null;
  const closed = new Set();
  const avoidMotorways = opts.avoid?.motorways;
  while (heap.size) {
    const v = heap.pop();
    if (closed.has(v)) continue;
    closed.add(v);
    const gv = g.get(v);
    if (gv + dist(net.x[v], net.y[v], tx, ty) / MAX_SPEED >= best) break;
    const el = endCost.get(v);
    if (el && gv + el.time < best) { best = gv + el.time; bestEnd = v; }
    const inE = prevEdge.get(v);
    for (const ei of net.out[v]) {
      const e = net.edges[ei];
      if (avoidMotorways && net.ways[e.way].cls === 0) continue;
      const mult = opts.penalty?.get(ei) ?? 1;
      const c = gv + e.time * mult + turnCost(net, inE, e);
      if (!g.has(e.to) || c < g.get(e.to)) { g.set(e.to, c); prev.set(e.to, v); prevEdge.set(e.to, e); heap.push(c + dist(net.x[e.to], net.y[e.to], tx, ty) / MAX_SPEED, e.to); }
    }
  }
  if (bestEnd == null) return null;

  if (bestEnd === "direct") return buildRoute(net, from, to, [], []);
  const nodes = [], edges = [];
  for (let v = bestEnd; v !== -1; v = prev.get(v)) { nodes.push(v); edges.push(prevEdge.get(v)); }
  nodes.reverse(); edges.reverse();
  return buildRoute(net, from, to, nodes, edges.filter(Boolean));
}

function headingPenalty(net, snap, forward, heading) {
  if (heading == null) return 0;
  const ax = net.x[snap.a], ay = net.y[snap.a], bx = net.x[snap.b], by = net.y[snap.b];
  const h = forward ? bearing(ax, ay, bx, by) : bearing(bx, by, ax, ay);
  return Math.abs(angleDiff(heading, h)) > 100 ? UTURN_START_PENALTY : 0;
}

/**
 * Route shape:
 *   coords   [[x,y],...] polyline from start point to end point
 *   ways     way id for each polyline segment (coords.length - 1 entries)
 *   nodes    graph nodes passed, with polyline index of each (nodeAt)
 *   cum      cumulative distance per vertex
 *   segTime  seconds for each segment; distance (m), duration (s)
 *   edgeIds  graph edges used (for alternatives and tests)
 */
function buildRoute(net, from, to, nodes, edges) {
  const coords = [[from.x, from.y]], ways = [], nodeAt = [];
  if (nodes.length === 0) { coords.push([to.x, to.y]); ways.push(from.way); }
  else {
    for (let i = 0; i < nodes.length; i++) {
      const v = nodes[i];
      ways.push(i === 0 ? from.way : edges[i - 1].way);
      coords.push([net.x[v], net.y[v]]); nodeAt.push(coords.length - 1);
    }
    coords.push([to.x, to.y]); ways.push(to.way);
  }
  // Remove zero-length steps (start or end exactly on a node).
  const c2 = [coords[0]], w2 = [], n2 = [];
  const map = new Map();
  for (let i = 1; i < coords.length; i++) {
    if (dist(...coords[i], ...c2[c2.length - 1]) < 0.01) { map.set(i, c2.length - 1); continue; }
    c2.push(coords[i]); w2.push(ways[i - 1]); map.set(i, c2.length - 1);
  }
  nodes.forEach((v, i) => n2.push(map.get(nodeAt[i]) ?? 0));
  if (c2.length === 1) { c2.push([to.x, to.y]); w2.push(to.way); }
  const cum = cumulative(c2);
  const segTime = w2.map((wid, i) => net.segmentTime(net.ways[wid], cum[i + 1] - cum[i]));
  const edgeIds = edges.map(e => e.id);
  return {
    coords: c2, ways: w2, nodes, nodeIndex: n2, cum, segTime, edgeIds,
    distance: cum[cum.length - 1], duration: segTime.reduce((a, b) => a + b, 0),
    from, to,
  };
}

/** Up to `count` distinct routes, fastest first. */
export function alternatives(net, from, to, opts = {}, count = 3) {
  const first = route(net, from, to, opts);
  if (!first) return [];
  const routes = [first];
  const penalty = new Map();
  for (let attempt = 0; attempt < 6 && routes.length < count; attempt++) {
    for (const r of routes) for (const e of r.edgeIds) penalty.set(e, (penalty.get(e) ?? 1) * 1.6);
    const r = route(net, from, to, { ...opts, penalty });
    if (!r) break;
    if (r.duration > first.duration * 1.5) break;
    const used = new Set(r.edgeIds);
    const tooSimilar = routes.some(o => {
      const shared = o.edgeIds.reduce((s, e) => s + (used.has(e) ? net.edges[e].len : 0), 0);
      return shared / Math.max(1, Math.min(o.distance, r.distance)) > 0.75;
    });
    if (!tooSimilar) routes.push(r);
  }
  return routes.sort((a, b) => a.duration - b.duration);
}

/** Main roads used, for a route summary such as "VIA E6 AND GÖTAGATAN". */
export function summarize(net, r) {
  const byName = new Map();
  r.ways.forEach((wid, i) => {
    const w = net.ways[wid]; if (!w.name) return;
    byName.set(w.name, (byName.get(w.name) ?? 0) + (r.cum[i + 1] - r.cum[i]) * (4 - w.cls));
  });
  return [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
}
