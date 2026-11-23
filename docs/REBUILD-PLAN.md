# Plan: rebuild cyberNAV as a fully custom app, without OsmAnd

23 Nov 2026 · Requested by Aurora · Status: **plan only, awaiting go**

## The ask, and how this plan reads it

Aurora: *"come up with a plan to completely rebuild the app with a completely custom interface not using OsmAnd."*

This plan reads that as: **drop OsmAnd entirely**, both its screens and its engine (map rendering, routing, guidance, voice, offline maps, search), and build cyberNAV as its own app on free, open components, with every screen designed in the Phosphor HUD style. If only the interface was meant, see [If you meant only the interface](#if-you-meant-only-the-interface) at the end; it is a much smaller job.

## Recommendation in short

Build a new Kotlin app around three open-source parts, and draw everything the user sees ourselves:

| Job | Use | Licence | Why this one |
| --- | --- | --- | --- |
| Map drawing (driving view) | **Our own OpenGL ES 3 renderer** reading vector tiles | ours | The night map is only roads, wireframe buildings, route and vehicle. No general-purpose map library draws true hidden-line wireframe buildings; a focused renderer for this small set of layers is smaller than bending one. The earlier prototype and the vehicle hidden-line renderer already prove the drawing approach. |
| Map drawing (browse / day map) | **MapLibre Native Android** | BSD-2 | Full-detail styled map with labels for browsing and the day mode, from the same tiles. Reads PMTiles offline. Phase 0 decides whether it can also do the driving view (if so, we skip our renderer). |
| Map data | **OpenStreetMap → PMTiles** built with **Planetiler** | ODbL data, Apache-2 tool | One file per country/region, offline, built by our CI. |
| Routing | **Valhalla** (on-device, offline tiles) | MIT | Runs on phones, multi-stop, alternatives, costing for car/truck/motorcycle (matches the vehicles), speed limits from OSM, instructions in many languages. |
| Turn-by-turn guidance | **Ferrostar** core (Stadia Maps) | BSD-3 | UI-free navigation core: progress along the route, off-route detection, spoken and visual instruction timing. Speaks Valhalla's route format. We supply all UI. |
| Voice | Android **TextToSpeech** | platform | Keep v0.0.12's `CyberVoice` choices (best offline voice, normal pitch). |
| Search | **Own offline index** (SQLite FTS5 per country, built in CI from OSM addresses and places) + optional online Photon/Nominatim | ours / ODbL | Works offline like OsmAnd; online adds fuzzier results when there is signal. |
| Android Auto | **Car App Library** (navigation category), our renderer on the map surface | Apache-2 | Same as the earlier prototype's `android/` app. Lets the cyberNAV HUD be drawn on the car's map too, which OsmAnd's car app never allowed. |
| Weather (later) | **Open-Meteo** | free, CC-BY | Free data, own implementation (Aurora's rule). |

Effort: roughly **16–22 working weeks** of build time to reach parity with today's v0.0.23, delivered as about six phases, each ending in something Aurora can install. The OsmAnd build keeps shipping until the new app is at least as good.

## Why this shape (and what was rejected)

- **Not Mapbox / Google / HERE / TomTom SDKs.** They are the fastest route to traffic and polished routing, but they are paid per user or per request, need accounts and keys, restrict restyling (Google) or need online access, and tie cyberNAV to a vendor. The original plan ([PLAN.md](PLAN.md)) recommended Mapbox; Aurora chose free and offline by going to OsmAnd, and this plan keeps that.
- **Not OSRM or GraphHopper on the phone.** OSRM needs server-class memory. GraphHopper runs on Android but its offline graph for a large country needs a lot of RAM on the phone; Valhalla's tiled graph loads only the tiles it needs.
- **Not reusing OsmAnd's engine as a library.** That is the "custom UI only" option below; it keeps GPLv3, the CC-BY-NC-ND artwork limit and the patch fragility.
- **Not the prototype's JS core in a WebView.** It proved the ideas (31 routing and guidance tests), but a WebView on a car surface is slow on weak head units and its routing does not scale to a whole country offline.

## What we keep from today

- The design: Phosphor HUD guide, the Unit 01 driving screen, all of [DESIGN.md](DESIGN.md) and [DECISIONS.md](DECISIONS.md). The new app should look the same on day one and then go further (every screen in HUD style).
- The ten vehicle models (`make_vehicles.py` already outputs .obj files; the hidden-line rules are in the handoff).
- The release rules, updater logic (`CyberUpdater`), voice logic (`CyberVoice`), theme colours (`CyberTheme`), driving-screen layout and behaviour (`CyberDrive` is mostly drawing code against a `State`; it ports to the new data source).
- The prototype's test scenarios (GPS noise, tunnels, jumps, wrong turns, voice timing) as acceptance tests for the new guidance.

## Architecture

```
┌──────────────────────────── phone app (Kotlin) ─────────────────────────────┐
│  UI: Phosphor HUD screens (Jetpack Compose + custom Canvas HUD)             │
│   driving HUD · search · route preview · saved places · downloads · settings│
├──────────────────────────────────────────────────────────────────────────────┤
│  Nav session  ── Ferrostar core (progress, off-route, instructions)         │
│     │              └─ Valhalla (offline routing, reroute, alternatives)     │
│     ├─ Location: Fused location provider + our smoothing (v0.0.13 glide)    │
│     └─ Voice: TextToSpeech (CyberVoice rules)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Map: our GL ES 3 renderer (driving)  │  MapLibre Native (browse, day)      │
│        └── both read PMTiles vector tiles from the downloaded country pack  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Data packs per country: map.pmtiles · valhalla tiles · search.sqlite       │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ same nav session
┌─────────────────────────────────────┴───────── Android Auto ────────────────┐
│ CarAppService · NavigationTemplate · our renderer + HUD on the map surface  │
└──────────────────────────────────────────────────────────────────────────────┘

CI (GitHub Actions, monthly + on demand):
  OSM extract (Geofabrik) → Planetiler → map.pmtiles
                          → valhalla_build_tiles → routing tiles
                          → our indexer → search.sqlite
  → upload per-country packs to file hosting; the app's download screen lists them
```

## Phases

Each phase ends with an installable build. While the new app is incomplete it ships as a separate test app (app id `net.faradaymicrosystems.cybernav.next`, prerelease tag `next-latest`), so it installs next to the real cyberNAV and the in-app updater (which reads only non-prerelease "latest") never offers it. Every change still gets a CHANGELOG entry.

| # | Phase | What gets built | Done when | Effort |
| --- | --- | --- | --- | --- |
| 0 | **Spikes** | (a) Render one city's PMTiles in our GL renderer: black ground, green roads, wireframe buildings, chase cam, 60 fps on a mid-range phone. (b) Same city in MapLibre with fill-extrusion buildings, to compare. (c) Valhalla route offline on the phone for that city. (d) Ferrostar driving a recorded GPS trace. | Aurora sees both renderers side by side and picks; offline routing works on a phone. | 2–3 wk |
| 1 | **Data pipeline** | CI job that builds map, routing and search packs for one country, then any country; hosting; pack manifest with sizes and dates. | A pack for Aurora's country downloads and opens in the test app. | 2–3 wk |
| 2 | **Map + driving view** | New app skeleton, renderer, location + smoothing, travel-direction chase cam, vehicles, themes, day/night, CRT overlay, driving HUD ported from `CyberDrive` (no routing yet). | Driving around shows the v0.0.23 look without OsmAnd. | 3–4 wk |
| 3 | **Navigation** | Search to destination, route preview with alternatives, START/STOP, turn-by-turn HUD, voice, ADD STOP / ADD ENDPOINT, rerouting, ARRIVING / ROUTE OBSTRUCTED alerts, minimap, speed limits. | A real drive across town with stops, a wrong turn and a tunnel works, and the prototype's test scenarios pass. | 4–5 wk |
| 4 | **Everything else on the phone** | HUD-style saved places (home/work/favourites), downloads screen, settings, first-run country download, updater, import of OsmAnd favourites (GPX). | Nothing in daily use needs a screen we did not design. | 2–3 wk |
| 5 | **Android Auto** | Car session, map surface with our renderer and a car-sized HUD, search and route preview templates, cluster data, navigation intents. | Desktop Head Unit and a real car both work. | 2–3 wk |
| 6 | **Switch-over** | Parity check against the OsmAnd build, release signing with a private key, final app id `net.faradaymicrosystems.cybernav`, release `cyberNAV v0.0.N` through the normal pipeline. | Aurora approves; the OsmAnd build is retired to a tag. | 1 wk |

Total: about 16–22 weeks. These are estimates, not commitments; Phase 0 tightens them.

## Decisions Aurora needs to make

| # | Question | Recommendation | Why |
| --- | --- | --- | --- |
| 1 | Full rebuild, or custom UI on OsmAnd's engine? | Full rebuild **if** owning everything (look, licence, car HUD) matters more than speed; otherwise custom UI first. | See the comparison below. |
| 2 | Signing key at the switch-over | New private key stored as a repo secret, accept one reinstall. | The current key is public ([KNOWN-ISSUES.md](KNOWN-ISSUES.md)); a new app is the natural moment, since settings will not carry over anyway. |
| 3 | Where map packs are hosted | Cloudflare R2 (no download fees), or GitHub Releases for small countries. | Packs are hundreds of MB to several GB per country; GitHub caps files at 2 GB. R2 costs a few dollars a month at Aurora's scale. |
| 4 | Which countries first | Aurora's own country only, then add on request. | Every country adds CI time and hosting. |
| 5 | Licence for the new code | Your choice; the new code no longer has to be GPLv3. | Only the OSM data attribution (ODbL) and the libraries' permissive licences remain. Commercial use becomes possible. |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Own renderer takes longer than planned (tile decoding, line joins, building extrusion, hidden lines) | Phase 2 slips | Phase 0 spike with a fixed time box; MapLibre fallback for the driving view. |
| Routing or search quality below OsmAnd's | Users notice | Compare on Aurora's real trips in Phase 3; Valhalla and the index are tunable; online Photon as a supplement. |
| Data pipeline cost and upkeep | Monthly CI time, hosting bill | One country at a time; build on demand, not daily. |
| Offline pack size on phones | Storage | Separate map, routing and search parts; region-level packs for big countries. |
| Android Auto on slow head units | Stutter in the car | Native GL renderer (not WebView); frame-time budget checked on the Desktop Head Unit and a real car. |
| Ferrostar is younger than OsmAnd's guidance | Edge cases | Its core is small and open; the prototype's scenario tests catch regressions; we can patch or replace pieces. |
| Feature parity gap (OsmAnd has years of extras: trip recording, GPX tracks, plugins) | Some features disappear | Agree the parity list in Phase 0; drop what cyberNAV does not need (Aurora already wanted extras stripped). |
| Still no live traffic | Same as today | Optional paid traffic feed later; not needed for parity. |

## If you meant only the interface

Keeping OsmAnd's engine and replacing every screen is the **own-UI plan paused on 16 Nov** ([ROADMAP.md](ROADMAP.md#paused-aurora-16-nov-2026-own-ui-on-osmands-engine)).

| | Full rebuild (this plan) | Custom UI on OsmAnd's engine |
| --- | --- | --- |
| Effort | ~16–22 weeks | ~5–8 weeks |
| Offline maps, routing, voice, search quality | New stack, must catch up | OsmAnd's, proven |
| Every screen in HUD style | Yes | Yes |
| HUD on the Android Auto map | Yes | Hard (inside OsmAnd's car renderer) |
| Licence | Yours to choose; commercial use possible | GPLv3 and CC-BY-NC-ND artwork: no commercial use |
| Fragility | Ordinary app code | ~40 regex patches + binary shader patches, re-fixed on each OsmAnd upgrade |
| Wireframe buildings | Our renderer, full control | Patched shaders (works today) |
| Users | One reinstall at the switch-over | Seamless updates continue |

A sensible middle path: build the custom UI on OsmAnd first (users get the new screens in weeks), with the screens written against our own small interfaces (`NavSession`, `MapView`, `SearchIndex`), so they move to the new engine later without being rewritten. That turns the full rebuild into an engine swap.
