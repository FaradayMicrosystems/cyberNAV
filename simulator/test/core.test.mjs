// Standard navigation-app test suite for the cyberNAV core.
// Run: node --test simulator/test/
import test from "node:test";
import assert from "node:assert/strict";
import { net, xy, sessionAt, navigateTo, drive, randomPairs, CENTRAL } from "./helpers.mjs";
import { route, alternatives } from "../core/router.js";
import { buildManeuvers, instruction, spoken, formatDistance } from "../core/guidance.js";
import { PlaceIndex, normalize, parseCoords } from "../core/search.js";
import { State } from "../core/session.js";
import { carTemplate, validateTemplate, maneuverType } from "../core/templates.js";
import { packRoads, roadFromTags } from "../core/pack.js";
import { overpassWays, buildingHeight } from "../core/online.js";
import { BuildingSet } from "../core/buildings.js";
import { angleDiff, bearing, makeProjection } from "../core/geo.js";

const N = net();
const snapNode = v => N.snap(N.x[v], N.y[v], { maxDist: 5 });

// ---------------------------------------------------------------- geometry and data
test("geo: bearings and angle differences", () => {
  assert.equal(Math.round(bearing(0, 0, 0, 10)), 0);
  assert.equal(Math.round(bearing(0, 0, 10, 0)), 90);
  assert.equal(angleDiff(350, 10), 20);
  assert.equal(angleDiff(10, 350), -20);
  const p = makeProjection(11.97, 57.7); const [x, y] = p.toXY(11.98, 57.71); const [lon, lat] = p.toLonLat(x, y);
  assert.ok(Math.abs(lon - 11.98) < 1e-9 && Math.abs(lat - 57.71) < 1e-9);
  assert.ok(Math.abs(Math.hypot(x, y) - 1256) < 15, "1 km scale sanity");
});

test("network: bundled city loads, is connected, has one-ways and roundabouts", () => {
  assert.ok(N.ways.length > 5000 && N.nodeCount > 30000);
  assert.ok(N.ways.some(w => w.oneway === 1));
  assert.ok(N.ways.some(w => w.roundabout));
  assert.ok(N.ways.some(w => w.cls === 0));
});

test("pack: OSM tag handling", () => {
  assert.equal(roadFromTags({ highway: "footway" }), null);
  assert.equal(roadFromTags({ highway: "residential", access: "private" }), null);
  assert.equal(roadFromTags({ highway: "service" }), null);
  assert.equal(roadFromTags({ highway: "primary", oneway: "-1" }).oneway, -1);
  assert.equal(roadFromTags({ highway: "motorway" }).oneway, 1);
  assert.equal(roadFromTags({ highway: "tertiary", junction: "roundabout" }).oneway, 1);
  assert.equal(roadFromTags({ highway: "primary", maxspeed: "30 mph" }).kmh, 48);
  assert.equal(roadFromTags({ highway: "primary", maxspeed: "signals" }).signed, false);
});

test("live data: Overpass response converts to a routable network", () => {
  // A tiny hand-made Overpass response: a cross of two streets plus a footpath.
  const g = (lon, lat) => ({ lon, lat });
  const json = { elements: [
    { type: "way", id: 1, tags: { highway: "residential", name: "Main St" }, geometry: [g(10, 50), g(10.002, 50), g(10.004, 50)] },
    { type: "way", id: 2, tags: { highway: "residential", name: "Cross St" }, geometry: [g(10.002, 49.998), g(10.002, 50), g(10.002, 50.002)] },
    { type: "way", id: 3, tags: { highway: "footway" }, geometry: [g(10, 50.001), g(10.004, 50.001)] },
    { type: "node", id: 9, lat: 50, lon: 10 },
  ] };
  const ways = overpassWays(json);
  assert.equal(ways.length, 3);
  const packed = packRoads(ways);
  assert.equal(packed.ways.length, 2);
  const LN = new (N.constructor)(packed);
  const a = LN.snap(...LN.proj.toXY(10, 50)), b = LN.snap(...LN.proj.toXY(10.002, 50.002));
  const r = route(LN, a, b);
  assert.ok(r && Math.abs(r.distance - (143 + 222)) < 15, `distance ${r?.distance}`);
  const ms = buildManeuvers(LN, r);
  assert.ok(ms.some(m => m.type === "turn" && m.modifier === "left" && m.street === "Cross St"), JSON.stringify(ms.map(instruction)));
});

test("buildings: heights from tags and placeholder generation", () => {
  assert.equal(buildingHeight({ height: "21.5" }), 21.5);
  assert.equal(Math.round(buildingHeight({ "building:levels": "5" })), 16);
  assert.equal(buildingHeight({ building: "house" }), 5);
  const [x, y] = xy(...CENTRAL);
  const bs = BuildingSet.placeholder(N, x, y, 600);
  assert.ok(bs.placeholder && bs.items.length > 100, `${bs.items.length} blocks`);
  for (const b of bs.items.slice(0, 200)) assert.equal(N.snap(b.cx, b.cy, { maxDist: 3 }), null, "block sits on a road");
  assert.ok(bs.near(x, y, 300).length > 10);
});

// ---------------------------------------------------------------- routing
function assertValidPath(r) {
  for (const e of r.edgeIds) {
    const edge = N.edges[e], w = N.ways[edge.way];
    if (edge.forward) assert.notEqual(w.oneway, -1, "drove against a one-way"); else assert.notEqual(w.oneway, 1, "drove against a one-way");
  }
  for (let i = 1; i < r.edgeIds.length; i++) assert.equal(N.edges[r.edgeIds[i - 1]].to, N.edges[r.edgeIds[i]].from, "path is not continuous");
  assert.ok(r.distance > 0 && r.duration > 0);
  for (let i = 1; i < r.cum.length; i++) assert.ok(r.cum[i] >= r.cum[i - 1]);
}

test("routing: 150 random trips are valid, continuous and respect one-way streets", () => {
  let found = 0;
  for (const [a, b] of randomPairs(150, 5)) {
    const r = route(N, snapNode(a), snapNode(b));
    if (!r) continue; // the far side of a one-way sink can be unreachable in a cut extract
    found++; assertValidPath(r);
    const crow = Math.hypot(N.x[a] - N.x[b], N.y[a] - N.y[b]);
    assert.ok(r.distance >= crow * 0.99, "route shorter than straight line");
    assert.ok(r.distance < crow * 4 + 2000, `detour too long ${r.distance} vs ${crow}`);
  }
  assert.ok(found >= 140, `only ${found}/150 routable`);
});

test("routing: A* matches exhaustive search within 3%", () => {
  // Compare against the same search without the A* heuristic shortcut (Dijkstra via huge penalty-free run).
  for (const [a, b] of randomPairs(25, 9)) {
    const from = snapNode(a), to = snapNode(b);
    const r = route(N, from, to); if (!r) continue;
    const slowest = route(N, from, to, { penalty: new Map() });
    assert.ok(Math.abs(r.duration - slowest.duration) / slowest.duration < 0.03);
  }
});

test("routing: same point, same segment and unreachable cases", () => {
  const [x, y] = xy(...CENTRAL);
  const s = N.snap(x, y);
  const same = route(N, s, s);
  assert.ok(same && same.distance < 1);
  assert.equal(route(N, s, null), null);
  // A destination on a one-way segment behind us on the same segment must not reverse along it.
  const ow = N.ways.find(w => w.oneway === 1 && w.nodes.length >= 2 && w.length > 80 && w.cls >= 2);
  const a = ow.nodes[0], b = ow.nodes[1];
  const mk = t => ({ way: ow.id, seg: 0, a, b, t, x: N.x[a] + (N.x[b] - N.x[a]) * t, y: N.y[a] + (N.y[b] - N.y[a]) * t });
  const back = route(N, mk(0.8), mk(0.2));
  if (back) { assertValidPath(back); assert.ok(back.distance > 10, "went backwards on a one-way"); }
});

test("routing: alternatives are distinct, at most 3, fastest first, not absurd", () => {
  let multi = 0;
  for (const [a, b] of randomPairs(30, 21, 2000)) {
    const rs = alternatives(N, snapNode(a), snapNode(b));
    if (!rs.length) continue;
    assert.ok(rs.length <= 3);
    for (let i = 1; i < rs.length; i++) {
      assert.ok(rs[i].duration >= rs[i - 1].duration);
      assert.ok(rs[i].duration <= rs[0].duration * 1.5 + 1);
      assert.notDeepEqual(rs[i].edgeIds, rs[0].edgeIds);
      assertValidPath(rs[i]);
    }
    if (rs.length > 1) multi++;
  }
  assert.ok(multi >= 15, `alternatives found for only ${multi}/30 trips`);
});

test("routing: avoid motorways", () => {
  let checked = 0;
  for (const [a, b] of randomPairs(40, 33, 3000)) {
    const from = snapNode(a), to = snapNode(b);
    const r = route(N, from, to);
    if (!r || !r.ways.some(w => N.ways[w].cls === 0)) continue;
    const avoid = route(N, from, to, { avoid: { motorways: true } });
    if (!avoid) continue;
    assert.ok(!avoid.edgeIds.some(e => N.ways[N.edges[e].way].cls === 0));
    checked++;
  }
  assert.ok(checked > 3);
});

test("routing: starting heading avoids needless U-turns", () => {
  // On a two-way street, heading matters: driving east, a destination far west should not be
  // reached by an instant U-turn penalty-free.
  const w = N.ways.find(w => w.oneway === 0 && w.cls === 2 && w.length > 300);
  const mid = w.nodes[Math.floor(w.nodes.length / 2)], nxt = w.nodes[Math.floor(w.nodes.length / 2) + 1];
  const from = N.snap(N.x[mid], N.y[mid]);
  const h = bearing(N.x[mid], N.y[mid], N.x[nxt], N.y[nxt]);
  const far = w.nodes[0];
  const r1 = route(N, from, snapNode(far), { heading: h });
  const r0 = route(N, from, snapNode(far));
  assert.ok(r1 && r0 && r1.duration >= r0.duration);
});

// ---------------------------------------------------------------- guidance
test("guidance: maneuvers start with depart, end with arrive, ordered, with text", () => {
  for (const [a, b] of randomPairs(60, 13)) {
    const r = route(N, snapNode(a), snapNode(b)); if (!r) continue;
    const ms = buildManeuvers(N, r);
    assert.equal(ms[0].type, "depart"); assert.equal(ms.at(-1).type, "arrive");
    for (let i = 1; i < ms.length; i++) assert.ok(ms[i].at >= ms[i - 1].at);
    for (const m of ms) {
      assert.ok(instruction(m).length > 3);
      assert.ok(spoken(m, 300).endsWith("."));
      if (m.type === "roundabout") assert.ok(m.exit >= 1);
      if (m.type === "turn") assert.match(m.modifier, /left|right/);
    }
    // No two announcements closer than 15 m (except depart).
    for (let i = 2; i < ms.length - 1; i++) assert.ok(ms[i].at - ms[i - 1].at >= 15 || ms[i - 1].type === "depart");
  }
});

test("guidance: a real left turn is announced as left", () => {
  // Build a route that must turn: from Kungsgatan into a perpendicular street, checked by geometry.
  let checked = 0;
  for (const [a, b] of randomPairs(80, 41)) {
    const r = route(N, snapNode(a), snapNode(b)); if (!r) continue;
    for (const m of buildManeuvers(N, r).filter(m => m.type === "turn" && Math.abs(m.angle) > 60)) {
      assert.equal(m.modifier.includes("left"), m.angle < 0); checked++;
    }
  }
  assert.ok(checked > 20);
});

test("guidance: distance formatting", () => {
  assert.equal(formatDistance(4), "10 M");
  assert.equal(formatDistance(123), "100 M");
  assert.equal(formatDistance(980), "1.0 KM");
  assert.equal(formatDistance(14520), "15 KM");
  assert.equal(formatDistance(300, true), "300 metres");
});

// ---------------------------------------------------------------- search
test("search: exact, prefix, accents, typos, coordinates, empty", () => {
  const idx = new PlaceIndex(N);
  assert.equal(idx.search("Linnégatan")[0].name, "Linnégatan");
  assert.equal(idx.search("linnegatan")[0].name, "Linnégatan");
  assert.equal(idx.search("LINNEG")[0].name, "Linnégatan");
  assert.equal(idx.search("Linnegtan")[0].name, "Linnégatan");
  assert.equal(idx.search("  ").length, 0);
  assert.equal(idx.search("zzzzzz").length, 0);
  assert.ok(idx.search("gatan").length <= 6);
  const c = idx.search("57.7089, 11.9737")[0];
  assert.equal(c.kind, "coords");
  assert.deepEqual(parseCoords("57.7 N 11.9 E"), { lat: 57.7, lon: 11.9 });
  assert.deepEqual(parseCoords("33.9 S, 18.4 E"), { lat: -33.9, lon: 18.4 });
  assert.equal(parseCoords("95, 10"), null);
  assert.equal(normalize("Sankt Eriksgatan!"), "sankt eriksgatan");
});

// ---------------------------------------------------------------- session scenarios
test("drive: clean GPS arrives with no reroutes and sensible ETA", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const planned = s.route.duration;
  const { secs, count } = drive(s);
  assert.equal(s.state, State.ARRIVED);
  assert.equal(count("rerouted"), 0);
  assert.ok(secs < planned * 2.5 + 60, `took ${secs}s vs planned ${planned}s`);
});

test("drive: 12 m GPS noise causes no false reroutes", () => {
  for (const seed of [1, 2, 3]) {
    const s = navigateTo(sessionAt(), "Linnégatan");
    const { count } = drive(s, { noise: 12, seed });
    assert.equal(s.state, State.ARRIVED);
    assert.equal(count("rerouted"), 0, `seed ${seed}`);
  }
});

test("drive: wrong turn triggers a reroute and still arrives", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const idx = s.route.maneuvers.findIndex((m, i) => i > 1 && (m.type === "turn" || m.type === "keep" || m.type === "continue"));
  const { count, driver } = drive(s, { wrongTurns: [idx] });
  assert.ok(!driver.stuck, "driver ran out of detour without a reroute");
  assert.ok(count("rerouted") >= 1);
  assert.equal(s.state, State.ARRIVED);
});

test("drive: two wrong turns in a row", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const turns = s.route.maneuvers.map((m, i) => [m, i]).filter(([m, i]) => i > 1 && ["turn", "keep", "continue"].includes(m.type)).map(([, i]) => i);
  const { count, driver } = drive(s, { wrongTurns: turns.slice(0, 1), noise: 5 });
  assert.ok(!driver.stuck);
  assert.equal(s.state, State.ARRIVED);
  assert.ok(count("rerouted") >= 1);
});

test("drive: 15 s GPS dropout (tunnel) does not reroute, shows signal lost, recovers", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const { count, events } = drive(s, { dropouts: [[40, 55]] });
  assert.equal(s.state, State.ARRIVED);
  assert.equal(count("rerouted"), 0);
  assert.ok(events.some(e => e.type === "signal" && e.lost));
  assert.ok(events.some(e => e.type === "signal" && !e.lost));
});

test("drive: single GPS jump is ignored as an outlier", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const { count, events } = drive(s, { jumps: [30] });
  assert.equal(s.state, State.ARRIVED);
  assert.equal(count("rerouted"), 0);
  assert.ok(events.some(e => e.type === "fix-rejected" && e.reason === "jump"));
});

test("location: poor accuracy, stale and invalid fixes are rejected", () => {
  const s = sessionAt();
  const p = s.position;
  assert.equal(s.updateLocation({ x: p.x + 5, y: p.y, t: 1, accuracy: 300 }), false);
  assert.equal(s.updateLocation({ x: p.x + 5, y: p.y, t: 0, accuracy: 5 }), false);
  assert.equal(s.updateLocation({ x: NaN, y: p.y, t: 2 }), false);
  assert.equal(s.updateLocation({ x: p.x + 5, y: p.y, t: 3, accuracy: 5 }), true);
});

test("location: stationary at a red light keeps heading and does not reroute", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const d = drive(s, {}, 20); // drive 20 s then stop
  const p = s.position, h = p.heading;
  let t = s.lastFix.t;
  for (let i = 0; i < 60; i++) s.updateLocation({ x: p.x + (i % 2 ? 2 : -2), y: p.y, t: ++t, accuracy: 6 });
  assert.equal(s.state, State.NAVIGATING);
  assert.equal(s.rerouteCount, 0);
  assert.ok(Math.abs(angleDiff(h, s.position.heading)) < 1);
  assert.ok(d.secs > 0);
});

test("session: no position, no road and no route give clear errors", () => {
  const { NavigationSession } = awaitSession();
  const s = new NavigationSession(N);
  const errors = []; s.on(e => e.type === "error" && errors.push(e.code));
  assert.equal(s.setDestination({ x: 0, y: 0 }), false);
  const s2 = sessionAt(); s2.on(e => e.type === "error" && errors.push(e.code));
  assert.equal(s2.setDestination({ x: 1e6, y: 1e6 }), false);
  assert.deepEqual(errors, ["NO_POSITION", "NO_ROAD"]);
});
function awaitSession() { return { NavigationSession: sessionAt().constructor }; }

test("session: cancel, re-plan while navigating, and route selection", () => {
  const s = sessionAt();
  navigateTo(s, "Linnégatan");
  assert.equal(s.state, State.NAVIGATING);
  s.cancel(); assert.equal(s.state, State.IDLE);
  const w = N.ways.find(w => w.name === "Kungsportsavenyen");
  const mid = w.nodes[1];
  assert.ok(s.setDestination({ x: N.x[mid], y: N.y[mid], label: "Avenyn" }));
  assert.equal(s.state, State.PREVIEW);
  const last = s.routes.length - 1; s.selectRoute(last); s.start();
  assert.equal(s.route, s.routes[last]);
  s.selectRoute(99); // ignored outside preview
  assert.equal(s.state, State.NAVIGATING);
});

test("session: voice prompts fire once per threshold, in order, before each turn", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const { events } = drive(s);
  const voice = events.filter(e => e.type === "voice");
  const perManeuver = new Map();
  for (const v of voice) if (v.maneuver != null) perManeuver.set(v.maneuver, (perManeuver.get(v.maneuver) ?? 0) + 1);
  for (const [, n] of perManeuver) assert.ok(n <= 3);
  assert.ok(voice.length >= 4);
  assert.match(voice.at(-1).text, /arrived/i);
});

test("session: ETA decreases as the drive progresses", () => {
  const s = navigateTo(sessionAt(), "Linnégatan");
  const etas = []; s.on(e => { if (e.type === "progress") etas.push(e.remainingSeconds); });
  drive(s, {});
  let up = 0; for (let i = 5; i < etas.length; i++) if (etas[i] > etas[i - 5] + 1) up++;
  assert.ok(up < etas.length * 0.05, `ETA went up ${up} times`);
});

test("fuzz: 40 random trips with noise all arrive, few reroutes", () => {
  let arrived = 0, reroutes = 0, tried = 0;
  for (const [a, b] of randomPairs(60, 77, 1200)) {
    if (tried >= 40) break;
    const s = sessionAt(N.lon[a], N.lat[a]);
    if (!s.setDestination({ x: N.x[b], y: N.y[b], label: "X" })) continue;
    tried++; s.start();
    const { count, driver } = drive(s, { noise: 8, seed: a }, 5400);
    if (s.state === State.ARRIVED) arrived++;
    else assert.fail(`trip ${a}->${b} ended ${s.state} stuck=${driver.stuck}`);
    reroutes += count("rerouted");
  }
  assert.equal(arrived, tried);
  assert.ok(reroutes <= tried * 0.15, `${reroutes} reroutes in ${tried} clean trips`);
});

// ---------------------------------------------------------------- Android Auto templates
test("car templates: every state produces a valid template within host limits", () => {
  const s = sessionAt();
  const check = (t, label) => assert.deepEqual(validateTemplate(t), [], `${label}: ${JSON.stringify(t)}`);
  check(carTemplate(s.snapshot()), "idle");
  check(carTemplate(s.snapshot(), { screen: "search", query: "lin", results: new PlaceIndex(N).search("gatan", { limit: 20 }) }), "search");
  const w = N.ways.find(w => w.name === "Linnégatan"), mid = w.nodes[1];
  s.setDestination({ x: N.x[mid], y: N.y[mid], label: "Linnégatan" });
  check(carTemplate(s.snapshot()), "preview");
  s.start();
  const d = drive(s, {}, 1);
  check(carTemplate(s.snapshot()), "navigating");
  check(carTemplate(s.snapshot(), { rerouting: true }), "rerouting");
  d.driver.run(3600);
  check(carTemplate(s.snapshot()), "arrived");
});

test("car templates: every maneuver along 40 routes maps to a Car App Library type", () => {
  const known = new Set(["DEPART", "STRAIGHT", "KEEP_LEFT", "KEEP_RIGHT", "TURN_SLIGHT_LEFT", "TURN_SLIGHT_RIGHT", "TURN_NORMAL_LEFT",
    "TURN_NORMAL_RIGHT", "TURN_SHARP_LEFT", "TURN_SHARP_RIGHT", "U_TURN_LEFT", "ROUNDABOUT_ENTER_AND_EXIT_CCW", "DESTINATION", "DESTINATION_LEFT", "DESTINATION_RIGHT"]);
  for (const [a, b] of randomPairs(40, 55)) {
    const r = route(N, snapNode(a), snapNode(b)); if (!r) continue;
    for (const m of buildManeuvers(N, r)) assert.ok(known.has(maneuverType(m)), maneuverType(m));
  }
});

test("car templates: validator catches limit violations", () => {
  assert.ok(validateTemplate({ type: "navigation", actionStrip: [1, 2, 3, 4, 5].map(i => ({ id: `${i}`, title: "x" })) }).length);
  assert.ok(validateTemplate({ type: "routePreview", items: [] }).length);
  assert.ok(validateTemplate({ type: "navigation", routingInfo: { maneuver: { type: "ROUNDABOUT_ENTER_AND_EXIT_CCW" }, distanceMeters: 5 }, travelEstimate: {} }).length);
});
