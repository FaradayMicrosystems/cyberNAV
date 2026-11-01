// Turns a route into maneuvers (turn-by-turn steps) and instruction text.
import { bearing, angleDiff, pointAlong } from "./geo.js";

const LOOK = 12; // metres to look back/ahead when measuring a turn, smooths noisy geometry

export function streetName(net, wayId) {
  const n = wayId == null ? "" : net.ways[wayId].name;
  return n || "UNNAMED ROAD";
}

function headingAt(route, s) { return pointAlong(route.coords, route.cum, s).heading; }

function modifierFor(a) {
  const m = Math.abs(a), side = a < 0 ? "left" : "right";
  if (m > 160) return "uturn";
  if (m > 120) return `sharp ${side}`;
  if (m > 45) return side;
  if (m > 20) return `slight ${side}`;
  return "straight";
}

/** Bearing of each outgoing edge at node v, as a turn angle relative to inHeading. */
function optionsAt(net, v, inHeading, cameFrom) {
  return net.outEdges(v).filter(e => e.to !== cameFrom).map(e => ({
    way: e.way, angle: angleDiff(inHeading, bearing(net.x[v], net.y[v], net.x[e.to], net.y[e.to])),
  }));
}

/**
 * Maneuvers for a route. Each: { type, modifier, angle, at (metres from start), x, y,
 * street (name after the maneuver), exit (roundabouts), index (polyline vertex) }.
 * type: depart | turn | keep | continue | roundabout | uturn | arrive
 */
export function buildManeuvers(net, route) {
  const out = [];
  const firstWay = route.ways[0];
  out.push({ type: "depart", modifier: compass(headingAt(route, 0.5)), angle: 0, at: 0, x: route.coords[0][0], y: route.coords[0][1], street: streetName(net, firstWay), index: 0 });

  const nodeIdx = route.nodeIndex;
  for (let k = 0; k < route.nodes.length; k++) {
    const i = nodeIdx[k];
    if (i <= 0 || i >= route.coords.length - 1) continue;
    const v = route.nodes[k];
    const inWay = route.ways[i - 1], outWay = route.ways[i];
    const wIn = net.ways[inWay], wOut = net.ways[outWay];
    const s = route.cum[i];
    const hIn = headingAt(route, Math.max(0, s - LOOK));
    const hOut = headingAt(route, Math.min(route.distance, s + LOOK));
    const a = angleDiff(hIn, hOut);

    // Roundabout: one maneuver at the entry with the exit number.
    if (!wIn.roundabout && wOut.roundabout) {
      let exits = 0, j = k + 1, exitWay = null;
      for (; j < route.nodes.length; j++) {
        const vi = nodeIdx[j];
        const w = net.ways[route.ways[vi]];
        const hasExit = net.outEdges(route.nodes[j]).some(e => !net.ways[e.way].roundabout);
        if (hasExit) exits++;
        if (!w || !w.roundabout) { exitWay = route.ways[vi]; break; }
      }
      out.push({ type: "roundabout", modifier: "", angle: a, at: s, x: route.coords[i][0], y: route.coords[i][1], street: streetName(net, exitWay ?? outWay), exit: Math.max(1, exits), index: i });
      k = Math.max(k, j - 1);
      continue;
    }
    if (wIn.roundabout) continue;

    const junction = net.degree[v] > 2;
    const nameChange = wIn.name !== wOut.name;
    const mod = modifierFor(a);
    if (!junction) {
      if (Math.abs(a) > 160) out.push(mk("uturn", "uturn"));
      continue;
    }
    const prevNode = route.nodes[k - 1] ?? -1;
    const opts = optionsAt(net, v, hIn, prevNode).filter(o => Math.abs(o.angle) < 170);
    const others = opts.filter(o => Math.abs(o.angle - a) > 1e-6 || o.way !== outWay);
    const straighter = others.some(o => Math.abs(o.angle) < Math.abs(a) - 10);
    const nearFork = others.find(o => Math.abs(o.angle - a) < 30);

    const sameRoad = !nameChange && wIn.name !== "";
    if (mod === "uturn") out.push(mk("uturn", "uturn"));
    else if (Math.abs(a) > 45 || (Math.abs(a) > (sameRoad ? 35 : 20) && straighter)) out.push(mk("turn", mod));
    else if (nearFork && !sameRoad && (nameChange || wIn.cls !== wOut.cls)) out.push(mk("keep", a <= nearFork.angle ? "left" : "right"));
    else if (nameChange && wOut.name) out.push(mk("continue", "straight"));

    function mk(type, modifier) {
      return { type, modifier, angle: a, at: s, x: route.coords[i][0], y: route.coords[i][1], street: streetName(net, outWay), index: i };
    }
  }

  // Merge maneuvers closer than 15 m (complex junctions): keep the later, more specific one.
  const merged = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && last.type !== "depart" && m.at - last.at < 15) merged[merged.length - 1] = m.type === "continue" ? last : m;
    else merged.push(m);
  }
  // Unnamed ramps and links: name the road they lead to instead ("TOWARD E6").
  for (const m of merged) {
    if (m.street !== "UNNAMED ROAD" || m.type === "depart") continue;
    for (let i = m.index; i < route.ways.length && route.cum[i] - m.at < 800; i++) {
      const n = net.ways[route.ways[i]].name;
      if (n) { m.street = n; m.toward = true; break; }
    }
  }
  const end = route.coords[route.coords.length - 1];
  merged.push({ type: "arrive", modifier: arrivalSide(route), angle: 0, at: route.distance, x: end[0], y: end[1], street: route.to?.label || streetName(net, route.ways[route.ways.length - 1]), index: route.coords.length - 1 });
  return merged;
}

function arrivalSide(route) {
  const t = route.to; if (!t || t.px == null) return "";
  const n = route.coords.length, [ax, ay] = route.coords[Math.max(0, n - 2)], [bx, by] = route.coords[n - 1];
  const cross = (bx - ax) * (t.py - ay) - (by - ay) * (t.px - ax);
  if (Math.hypot(t.px - bx, t.py - by) < 4) return "";
  return cross > 0 ? "left" : "right";
}

const DIRS = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
export function compass(h) { return DIRS[Math.round(h / 45) % 8].toLowerCase(); }

/** Short console-style instruction for the HUD, e.g. "TURN LEFT // KUNGSGATAN". */
export function instruction(m) {
  const st = (m.toward ? "TOWARD " : "") + (m.street || "").toUpperCase();
  switch (m.type) {
    case "depart": return `HEAD ${m.modifier.toUpperCase()} // ${st}`;
    case "turn": return `TURN ${m.modifier.toUpperCase()} // ${st}`;
    case "keep": return `KEEP ${m.modifier.toUpperCase()} // ${st}`;
    case "continue": return `CONTINUE // ${st}`;
    case "roundabout": return `ROUNDABOUT // EXIT ${m.exit} // ${st}`;
    case "uturn": return `U-TURN // ${st}`;
    case "arrive": return `ARRIVE // ${st}${m.modifier ? ` · ON ${m.modifier.toUpperCase()}` : ""}`;
    default: return st;
  }
}

/** Spoken sentence for voice guidance. */
export function spoken(m, distM) {
  const d = distM == null ? "" : `In ${formatDistance(distM, true)}, `;
  const st = m.street && m.street !== "UNNAMED ROAD" ? (m.toward ? ` toward ${m.street}` : ` onto ${m.street}`) : "";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  switch (m.type) {
    case "depart": return `Head ${m.modifier}${st.replace("onto", "on")}.`;
    case "turn": return cap(`${d}turn ${m.modifier}${st}.`);
    case "keep": return cap(`${d}keep ${m.modifier}${st}.`);
    case "continue": return cap(`${d}continue${st}.`);
    case "roundabout": return cap(`${d}at the roundabout, take exit ${m.exit}${st}.`);
    case "uturn": return cap(`${d}make a U-turn.`);
    case "arrive": return cap(`${d}you will arrive at ${m.street}${m.modifier ? `, on the ${m.modifier}` : ""}.`).replace("In ", d ? "In " : "");
    default: return "";
  }
}

/** Distance text rounded the way drivers read it: 50 m steps, then 0.1 km. */
export function formatDistance(m, words = false) {
  if (m < 1000) {
    const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
    if (r < 1000) return words ? `${r} metres` : `${r} M`;
  }
  const km = m / 1000;
  const t = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return words ? `${t} kilometres` : `${t} KM`;
}

/** Glyph for a maneuver, drawn by the turn-icon renderer. */
export function glyphFor(m) {
  if (m.type === "arrive") return "◆";
  if (m.type === "roundabout") return "⟳";
  if (m.type === "uturn") return "↶";
  if (m.modifier?.includes("left")) return "◂";
  if (m.modifier?.includes("right")) return "▸";
  return "▴";
}
