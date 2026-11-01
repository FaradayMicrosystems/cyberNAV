// Geometry helpers. All routing maths runs in a local flat metre grid (x east, y north),
// which is accurate to well under 0.1% across a city-sized extract.

export const M_PER_DEG_LAT = 110574;

export function makeProjection(lon0, lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  return {
    lon0, lat0, kx,
    toXY: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * M_PER_DEG_LAT],
    toLonLat: (x, y) => [lon0 + x / kx, lat0 + y / M_PER_DEG_LAT],
  };
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Compass bearing in degrees (0 = north, 90 = east) from a to b. */
export function bearing(ax, ay, bx, by) {
  const b = Math.atan2(bx - ax, by - ay) * 180 / Math.PI;
  return (b + 360) % 360;
}

/** Signed smallest difference b - a in degrees, in (-180, 180]. Positive = clockwise (right). */
export function angleDiff(a, b) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Project point p onto segment ab. Returns { t (0..1), x, y, d }. */
export function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { t, x, y, d: Math.hypot(px - x, py - y) };
}

/** Cumulative distances along a polyline [[x,y],...]. */
export function cumulative(coords) {
  const c = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) c[i] = c[i - 1] + dist(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  return c;
}

/** Point and heading at distance s along a polyline with cumulative array cum. */
export function pointAlong(coords, cum, s) {
  const n = coords.length;
  if (s <= 0) return { x: coords[0][0], y: coords[0][1], heading: n > 1 ? bearing(...coords[0], ...coords[1]) : 0, i: 0 };
  if (s >= cum[n - 1]) return { x: coords[n - 1][0], y: coords[n - 1][1], heading: n > 1 ? bearing(...coords[n - 2], ...coords[n - 1]) : 0, i: n - 2 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo];
  const t = seg === 0 ? 0 : (s - cum[lo]) / seg;
  const [ax, ay] = coords[lo], [bx, by] = coords[hi];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, heading: bearing(ax, ay, bx, by), i: lo };
}

/** Deterministic PRNG (mulberry32) so simulated drives and tests are repeatable. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian sample via Box-Muller. */
export function gauss(rand) {
  let u = 0; while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
