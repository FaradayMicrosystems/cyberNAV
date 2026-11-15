// Android Auto template model. Builds a plain description of what the car host should show
// (mirroring the Car App Library's NavigationTemplate, MapWithContentTemplate and
// SearchTemplate). The Android app turns this JSON into real templates; the browser
// simulator draws it as a mock head unit; the tests check the host's limits.

export const LIMITS = { actionStrip: 4, mapActionStrip: 4, listItems: 6, titleChars: 40, actionTitleChars: 12 };

const MANEUVER = {
  depart: () => "DEPART",
  arrive: m => m.modifier === "left" ? "DESTINATION_LEFT" : m.modifier === "right" ? "DESTINATION_RIGHT" : "DESTINATION",
  uturn: () => "U_TURN_LEFT",
  roundabout: () => "ROUNDABOUT_ENTER_AND_EXIT_CCW",
  continue: () => "STRAIGHT",
  keep: m => m.modifier === "left" ? "KEEP_LEFT" : "KEEP_RIGHT",
  turn: m => {
    const side = m.modifier.includes("left") ? "LEFT" : "RIGHT";
    if (m.modifier.startsWith("slight")) return `TURN_SLIGHT_${side}`;
    if (m.modifier.startsWith("sharp")) return `TURN_SHARP_${side}`;
    return `TURN_NORMAL_${side}`;
  },
};
/** Car App Library Maneuver.TYPE_* name (without the TYPE_ prefix). */
export function maneuverType(m) { return (MANEUVER[m.type] ?? (() => "STRAIGHT"))(m); }

const MAP_ACTIONS = [{ id: "zoomIn", icon: "+" }, { id: "zoomOut", icon: "−" }, { id: "recenter", icon: "◎" }, { id: "tilt", icon: "3D" }];

function fmtDuration(s) {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function fmtKm(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
function clip(s, n) { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/**
 * snapshot: NavigationSession.snapshot(); ui: { screen: 'map'|'search'|'preview', query, results, muted, now (ms), rerouting }
 */
export function carTemplate(snap, ui = {}) {
  const now = ui.now ?? Date.now();
  if (ui.screen === "search") {
    return {
      type: "search", query: ui.query ?? "", hint: "Search places or streets",
      loading: !!ui.searching,
      items: (ui.results ?? []).slice(0, LIMITS.listItems).map((r, i) => ({ id: `result:${i}`, title: clip(r.name, LIMITS.titleChars), text: clip(r.detail ?? fmtKm(r.distance ?? 0), LIMITS.titleChars) })),
    };
  }
  if (snap.state === "PREVIEW") {
    return {
      type: "routePreview", title: clip(snap.destination || "Destination", LIMITS.titleChars),
      selected: snap.selected,
      items: snap.routes.slice(0, LIMITS.listItems).map(r => ({ id: `route:${r.index}`, title: `${fmtDuration(r.duration)} · ${fmtKm(r.distance)}`, text: clip(r.via.length ? `via ${r.via.join(", ")}` : "", LIMITS.titleChars) })),
      navigateAction: { id: "start", title: "Start" },
      actionStrip: [{ id: "cancel", title: "Cancel" }],
      mapActionStrip: MAP_ACTIONS.slice(0, 2),
    };
  }
  if (snap.state === "NAVIGATING") {
    const n = snap.next;
    return {
      type: "navigation",
      routingInfo: ui.rerouting || !n ? { loading: true } : {
        maneuver: { type: maneuverType(n), roundaboutExit: n.exit ?? null },
        distanceMeters: Math.round(n.distance), cue: clip(sentence(n), 60), road: clip(n.street, LIMITS.titleChars),
      },
      travelEstimate: { remainingMeters: Math.round(snap.remainingMeters), remainingSeconds: Math.round(snap.remainingSeconds), arrivalEpochMs: now + snap.remainingSeconds * 1000 },
      actionStrip: [{ id: "end", title: "End" }, { id: "mute", title: ui.muted ? "Unmute" : "Mute" }],
      mapActionStrip: MAP_ACTIONS,
      speedLimit: snap.speedLimit, signalLost: snap.signalLost,
    };
  }
  if (snap.state === "ARRIVED") {
    return { type: "navigation", message: { title: "Arrived", text: clip(snap.destination || "Destination", LIMITS.titleChars) }, actionStrip: [{ id: "done", title: "Done" }], mapActionStrip: MAP_ACTIONS.slice(0, 3) };
  }
  // Free drive.
  return {
    type: "navigation",
    actionStrip: [{ id: "search", title: "Search" }, { id: "demo", title: ui.demoActive ? "Stop demo" : "Demo drive" }],
    mapActionStrip: MAP_ACTIONS,
    message: ui.error ? { title: "Notice", text: clip(ui.error, LIMITS.titleChars) } : null,
  };
}

function sentence(n) {
  const st = n.street && n.street !== "UNNAMED ROAD" ? n.street : "";
  switch (n.type) {
    case "turn": return `Turn ${n.modifier}${st ? ` onto ${st}` : ""}`;
    case "keep": return `Keep ${n.modifier}${st ? ` toward ${st}` : ""}`;
    case "continue": return `Continue${st ? ` onto ${st}` : ""}`;
    case "roundabout": return `Roundabout, exit ${n.exit}${st ? ` onto ${st}` : ""}`;
    case "uturn": return "Make a U-turn";
    case "arrive": return `Arrive${st ? ` at ${st}` : ""}`;
    default: return st;
  }
}

/** Returns a list of violations of the host limits (empty when the template is valid). */
export function validateTemplate(t) {
  const errs = [];
  if (!["navigation", "routePreview", "search"].includes(t.type)) errs.push(`unknown type ${t.type}`);
  if ((t.actionStrip?.length ?? 0) > LIMITS.actionStrip) errs.push("too many actions");
  if ((t.mapActionStrip?.length ?? 0) > LIMITS.mapActionStrip) errs.push("too many map actions");
  if ((t.items?.length ?? 0) > LIMITS.listItems) errs.push("list too long");
  for (const a of [...(t.actionStrip ?? []), ...(t.navigateAction ? [t.navigateAction] : [])]) if (a.title && a.title.length > LIMITS.actionTitleChars) errs.push(`action title too long: ${a.title}`);
  for (const it of t.items ?? []) { if (!it.title) errs.push("item without title"); if (it.title.length > LIMITS.titleChars) errs.push("item title too long"); }
  if (t.type === "navigation" && t.routingInfo && !t.routingInfo.loading) {
    const r = t.routingInfo;
    if (!r.maneuver?.type) errs.push("routing info without maneuver");
    if (!(r.distanceMeters >= 0)) errs.push("routing info without distance");
    if (!t.travelEstimate) errs.push("navigation without travel estimate");
    if (r.maneuver?.type?.startsWith("ROUNDABOUT") && !(r.maneuver.roundaboutExit >= 1)) errs.push("roundabout without exit number");
  }
  if (t.type === "navigation" && t.routingInfo && t.message) errs.push("routing info and message together");
  if (t.type === "routePreview" && !t.navigateAction) errs.push("route preview without navigate action");
  if (t.type === "routePreview" && !(t.items?.length)) errs.push("route preview without routes");
  return errs;
}
