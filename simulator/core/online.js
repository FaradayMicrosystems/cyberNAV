// Live OpenStreetMap data for the area around the user: roads (Overpass API), buildings
// with heights (Overpass API) and address/POI search (Nominatim). All free public services
// with fair-use limits, fine for a prototype; the production app swaps in Mapbox.
import { packRoads, DRIVABLE } from "./pack.js";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

async function overpass(query, { timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  let lastErr;
  for (const url of OVERPASS) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: "POST", body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl?.signal });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; } finally { if (timer) clearTimeout(timer); }
  }
  throw lastErr ?? new Error("Overpass unavailable");
}

/** Convert an Overpass JSON response (ways with `out geom`) into [{ coords, tags }]. */
export function overpassWays(json) {
  return (json.elements || []).filter(e => e.type === "way" && e.geometry?.length > 1)
    .map(e => ({ id: e.id, coords: e.geometry.map(g => [g.lon, g.lat]), tags: e.tags || {} }));
}

/** Drivable roads within radius metres of lat/lon, packed for RoadNetwork. */
export async function fetchRoads(lat, lon, radius = 5000, opts) {
  const hw = [...DRIVABLE].join("|");
  const q = `[out:json][timeout:40];way["highway"~"^(${hw})$"](around:${Math.round(radius)},${lat},${lon});out geom tags;`;
  const ways = overpassWays(await overpass(q, opts));
  return packRoads(ways, "Road data © OpenStreetMap contributors (ODbL), live via Overpass API.");
}

/** Height in metres from OSM building tags. */
export function buildingHeight(tags) {
  const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const h = num(tags.height) ?? num(tags["building:height"]);
  if (h) return Math.min(h, 400);
  const lv = num(tags["building:levels"]);
  if (lv != null) return Math.min(400, lv * 3.2 + (num(tags["roof:levels"]) ?? 0) * 2);
  const small = ["house", "detached", "garage", "garages", "shed", "hut", "kiosk", "bungalow", "cabin", "roof", "carport"];
  return small.includes(tags.building) ? 5 : 12;
}

/** Buildings within radius of lat/lon as [{ ring: [[lon, lat]...], h, min }]. */
export async function fetchBuildings(lat, lon, radius = 1500, opts) {
  const q = `[out:json][timeout:40];(way["building"](around:${Math.round(radius)},${lat},${lon});way["building:part"](around:${Math.round(radius)},${lat},${lon}););out geom tags;`;
  return overpassWays(await overpass(q, opts)).map(w => ({ ring: w.coords, h: buildingHeight(w.tags),
    min: parseFloat(w.tags.min_height) || (parseFloat(w.tags["building:min_level"]) || 0) * 3.2, part: !!w.tags["building:part"] }));
}

/** Address and place search near lat/lon (Nominatim). */
export async function searchPlaces(query, lat, lon, { limit = 6, fetchImpl = globalThis.fetch } = {}) {
  const d = 0.25;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(query)}` +
    `&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}&bounded=0&accept-language=en`;
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Search ${res.status}`);
  const rows = await res.json();
  return rows.map(r => ({ kind: "place", name: (r.name || r.display_name.split(",")[0]).trim(),
    detail: r.display_name.split(",").slice(1, 3).join(",").trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon), type: r.type }));
}
