import data from "../data/network.js";
import { RoadNetwork } from "../core/network.js";
import { NavigationSession } from "../core/session.js";
import { SimulatedDriver } from "../core/drive.js";
import { rng } from "../core/geo.js";

let cached;
export function net() { return cached ??= new RoadNetwork(data); }

export const CENTRAL = [11.9737, 57.7089];
export function xy(lon, lat) { return net().proj.toXY(lon, lat); }

/** Session positioned at lon/lat, stationary. */
export function sessionAt(lon = CENTRAL[0], lat = CENTRAL[1], opts) {
  const s = new NavigationSession(net(), opts);
  const [x, y] = xy(lon, lat);
  const snap = net().snap(x, y, { maxDist: 300 });
  s.updateLocation({ x: snap.x, y: snap.y, t: 0, accuracy: 5, speed: 0 });
  return s;
}

/** Plan to a street by name, start, and return the session. */
export function navigateTo(s, street) {
  const w = net().ways.find(w => w.name === street);
  if (!w) throw new Error(`no street ${street}`);
  const mid = w.nodes[Math.floor(w.nodes.length / 2)];
  if (!s.setDestination({ x: net().x[mid], y: net().y[mid], label: street })) throw new Error("routing failed");
  s.start();
  return s;
}

/** Drive to arrival with the simulated driver. */
export function drive(s, opts = {}, maxSeconds = 3600) {
  const d = new SimulatedDriver(s, opts);
  const events = [];
  const off = s.on(e => events.push(e));
  const secs = d.run(maxSeconds);
  off(); d.dispose();
  return { secs, events, driver: d, count: type => events.filter(e => e.type === type).length };
}

/** Random pairs of graph nodes, deterministic. */
export function randomPairs(n, seed = 3, minDist = 800) {
  const N = net(), r = rng(seed), out = [];
  while (out.length < n) {
    const a = Math.floor(r() * N.nodeCount), b = Math.floor(r() * N.nodeCount);
    if (Math.hypot(N.x[a] - N.x[b], N.y[a] - N.y[b]) < minDist) continue;
    if (N.out[a].length === 0 || N.ways[N.edges[N.out[a][0]].way].cls === 0) continue;
    out.push([a, b]);
  }
  return out;
}
