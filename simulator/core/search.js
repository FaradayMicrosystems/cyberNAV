// Offline place search over street names in the loaded network, plus coordinates.
// Online address and POI search (Nominatim) lives in online.js and merges with this.

export function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export class PlaceIndex {
  constructor(net) {
    this.net = net;
    const byName = new Map();
    for (const w of net.ways) {
      if (!w.name) continue;
      let e = byName.get(w.name);
      if (!e) byName.set(w.name, e = { name: w.name, ways: [], length: 0, cls: 3 });
      e.ways.push(w.id); e.length += w.length; e.cls = Math.min(e.cls, w.cls);
    }
    this.streets = [...byName.values()].map(e => {
      // Representative point: middle of the longest piece of the street.
      const w = e.ways.map(id => net.ways[id]).sort((a, b) => b.length - a.length)[0];
      const mid = w.nodes[Math.floor(w.nodes.length / 2)];
      return { kind: "street", name: e.name, norm: normalize(e.name), x: net.x[mid], y: net.y[mid], way: w.id, cls: e.cls, length: e.length };
    });
  }

  /** Up to `limit` results for `query`, nearest first among equally good matches. */
  search(query, { x = 0, y = 0, limit = 6 } = {}) {
    const q = normalize(query);
    if (!q) return [];
    const coord = parseCoords(query);
    const results = [];
    if (coord) {
      const [cx, cy] = this.net.proj.toXY(coord.lon, coord.lat);
      results.push({ kind: "coords", name: `${coord.lat.toFixed(5)} N ${coord.lon.toFixed(5)} E`, x: cx, y: cy, score: 0 });
    }
    const words = q.split(" ");
    for (const s of this.streets) {
      let score = null;
      if (s.norm === q) score = 0;
      else if (s.norm.startsWith(q)) score = 1;
      else if (words.every(w => s.norm.split(" ").some(t => t.startsWith(w)))) score = 2;
      else if (s.norm.includes(q)) score = 3;
      else if (q.length >= 4) {
        const head = s.norm.slice(0, q.length);
        const d = lev(q, head, q.length >= 7 ? 2 : 1);
        if (d <= (q.length >= 7 ? 2 : 1)) score = 4 + d;
      }
      if (score == null) continue;
      results.push({ ...s, score, distance: Math.hypot(s.x - x, s.y - y) });
    }
    results.sort((a, b) => a.score - b.score || (a.distance ?? 0) - (b.distance ?? 0) || a.cls - b.cls);
    return results.slice(0, limit);
  }
}

/** "57.7089, 11.9746" or "57.7089 N 11.9746 E" → { lat, lon }, else null. */
export function parseCoords(s) {
  const m = String(s).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = parseFloat(m[1]), lon = parseFloat(m[3]);
  if (m[2]?.toUpperCase() === "S") lat = -lat;
  if (m[4]?.toUpperCase() === "W") lon = -lon;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
