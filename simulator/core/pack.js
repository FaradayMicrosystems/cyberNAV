// Packs OpenStreetMap road ways into the compact network format RoadNetwork reads.
// Used by the build tool (bundled demo city) and at runtime (live area around the user).

export const DRIVABLE = new Set(["motorway","motorway_link","trunk","trunk_link","primary","primary_link",
  "secondary","secondary_link","tertiary","tertiary_link","unclassified","residential","living_street","road"]);
const CLASS = { motorway:0, motorway_link:0, trunk:0, trunk_link:0, primary:1, primary_link:1, secondary:1,
  secondary_link:1, tertiary:2, tertiary_link:2, unclassified:3, residential:3, living_street:3, road:3 };
const DEFAULT_KMH = { motorway:100, motorway_link:50, trunk:80, trunk_link:50, primary:50, primary_link:40,
  secondary:50, secondary_link:40, tertiary:40, tertiary_link:30, unclassified:40, residential:30, living_street:10, road:30 };
const NO = new Set(["no","private"]);

function parseSpeed(v) {
  if (!v) return NaN;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return NaN;
  return /mph/i.test(v) ? Math.round(n * 1.609) : n;
}

/** Road filter and attributes from OSM tags; null when not drivable. */
export function roadFromTags(p) {
  if (!DRIVABLE.has(p.highway) || p.area === "yes") return null;
  if (NO.has(p.access) && !(p.motor_vehicle && !NO.has(p.motor_vehicle)) && !(p.motorcar && !NO.has(p.motorcar))) return null;
  if (NO.has(p.motor_vehicle) || NO.has(p.motorcar) || NO.has(p.vehicle)) return null;
  let oneway = 0;
  if (["yes","1","true"].includes(p.oneway)) oneway = 1;
  else if (p.oneway === "-1" || p.oneway === "reverse") oneway = -1;
  else if (p.oneway !== "no" && (p.junction === "roundabout" || p.junction === "circular" || p.highway === "motorway" || p.highway === "motorway_link")) oneway = 1;
  let kmh = parseSpeed(p.maxspeed);
  const signed = Number.isFinite(kmh) && kmh > 0;
  if (!signed) kmh = DEFAULT_KMH[p.highway];
  return { name: p.name || p.ref || "", cls: CLASS[p.highway], oneway, kmh, signed,
    round: p.junction === "roundabout" || p.junction === "circular" ? 1 : 0, tunnel: p.tunnel && p.tunnel !== "no" ? 1 : 0, bridge: p.bridge && p.bridge !== "no" ? 1 : 0 };
}

/**
 * ways: [{ coords: [[lon, lat], ...], tags: {...} }]
 * Returns the packed object, keeping only the largest connected part of the network.
 */
export function packRoads(ways, attribution = "Road data © OpenStreetMap contributors (ODbL).") {
  const roads = [];
  for (const w of ways) { const r = roadFromTags(w.tags || {}); if (r && w.coords?.length > 1) roads.push({ ...r, coords: w.coords }); }
  if (!roads.length) throw new Error("No drivable roads in this area");
  const key = c => `${Math.round(c[0] * 1e6)},${Math.round(c[1] * 1e6)}`;
  const nodeIndex = new Map(), nodes = [];
  for (const w of roads) {
    w.idx = w.coords.map(c => {
      const k = key(c);
      if (!nodeIndex.has(k)) { nodeIndex.set(k, nodes.length); nodes.push([Math.round(c[0] * 1e6), Math.round(c[1] * 1e6)]); }
      return nodeIndex.get(k);
    }).filter((n, i, a) => i === 0 || a[i - 1] !== n);
  }
  const parent = Int32Array.from(nodes, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const w of roads) for (let i = 1; i < w.idx.length; i++) { const a = find(w.idx[i]), b = find(w.idx[0]); if (a !== b) parent[a] = b; }
  const size = new Map();
  for (let i = 0; i < nodes.length; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  let main = -1, best = -1; for (const [r, s] of size) if (s > best) { best = s; main = r; }
  const kept = roads.filter(w => w.idx.length > 1 && find(w.idx[0]) === main);

  const remap = new Map(), used = [];
  for (const w of kept) w.idx = w.idx.map(n => { if (!remap.has(n)) { remap.set(n, used.length); used.push(nodes[n]); } return remap.get(n); });
  const names = [...new Set(kept.map(w => w.name))].sort();
  const nameId = new Map(names.map((n, i) => [n, i]));
  let x0 = Infinity, y0 = Infinity; for (const n of used) { if (n[0] < x0) x0 = n[0]; if (n[1] < y0) y0 = n[1]; }
  const flat = new Array(used.length * 2); used.forEach((n, i) => { flat[2 * i] = n[0] - x0; flat[2 * i + 1] = n[1] - y0; });
  const wayRows = kept.map(w => [nameId.get(w.name), w.cls, w.oneway, w.kmh, (w.signed ? 1 : 0) | (w.round << 1) | (w.tunnel << 2) | (w.bridge << 3), w.idx]);
  return { attribution, origin: [x0, y0], scale: 1e6, nodes: flat, names, ways: wayRows };
}
