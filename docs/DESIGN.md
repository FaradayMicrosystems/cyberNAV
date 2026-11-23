# cyberNAV design

What cyberNAV should look like, where the sources of truth are, and how the shipping app departs from them (on purpose).

## Sources of truth, in priority order

1. **Aurora's latest decisions** in [DECISIONS.md](DECISIONS.md). These override everything below when they conflict.
2. **Design handoff:** [`concepts/CYBERNAV-HANDOFF.md`](concepts/CYBERNAV-HANDOFF.md) (HUD layout, map camera, alert states, ten vehicles and their geometry, phosphor themes). Concept files: [`concepts/cyberNAV-v0.0.1/`](concepts/cyberNAV-v0.0.1/) and [`concepts/vehicle-select/`](concepts/vehicle-select/).
3. **Map screen reference:** "Cassette Nav Screens" artifact, screen *Unit 01 · CyberNav · P1 green* (https://claude.ai/artifact/LpwHz2VUJwZj6UuaKc9GHz, private to Aurora).
4. **Phosphor HUD design system:** https://claude.ai/artifact/3L6JbU7PhNtWVkihiVy6hq (private to Aurora). Repo copy: [`phosphor-hud/`](phosphor-hud/README.md) (tokens in `tokens.css` / `tokens.json`, components, `map-styling.md`).

Aurora's standing rule: any app they ask to look "retrofuture" or "80s" uses the Phosphor HUD guide.

## The look in one line

A cold, minimal "aesthetic nav device" from a 1979 film set: one glowing phosphor colour on black, wireframe vector graphics with hidden lines removed, uppercase telemetry, scanlines. It is **not** a full map.

## Colours as shipped

| Role | Value | Notes |
| --- | --- | --- |
| Night ground, sky, fog | `#000000` | Pure black on the map (the style guide's `ground` #020503 is for UI panels). |
| Main roads, HUD ink (Green theme) | `#B8FF7A` | Token `phosphor`. Motorway to tertiary. |
| Side streets | `#668E44` | Token `ink-muted`: same green at ~55%. Residential, service, track and similar. |
| 3D building edges | `#B8FF7A` | Same green as roads (Aurora, 15 Nov). User-changeable in Configure map > 3D buildings > Colour. |
| 3D building faces | near-black, opaque | Hidden-line look. |
| Active route | `#FFDF3D` | Yellow in every theme. |
| Vehicles | body `#FFDF3D`, lines `#000000` | Solid route-yellow with black wireframe, in every theme (Aurora, 16 Nov). |
| Alerts | `#FF5A44` | Token `signal-alert`. ROUTE OBSTRUCTED, speed-limit overspeed (red-orange). |
| HUD small text | `#93CC62` | `LABEL` tone, ink at ~80%, for legibility on black (v0.0.23). |
| HUD panel fill | `#0C1408` | Black with a faint ink tint (v0.0.23). |

### Phosphor themes (THEME button)

| Theme | Ink (main roads, HUD, building edges) | Dim (side streets, dim text) |
| --- | --- | --- |
| Green (default) | `#B8FF7A` | `#668E44` |
| Amber | `#FFB000` | `#8D6100` |
| Ice | `#9FE8FF` | `#58808D` |
| White | `#E6EEF5` | `#7F8488` |

Defined twice and must stay in sync: `CyberTheme.java` (`INK`, `DIM`) and `recolor.py` (`THEMES`).

### Day (light) mode

Dark phosphor ink on pale "paper" (`recolor.py` `PAPER` ramp), for sunlight. Keeps OsmAnd's full map detail. Night is the default; DAY / NIGHT switches by hand. The app's own menus stay dark.

## Type

- **Share Tech Mono** (OFL 1.1) is the HUD and app font: bundled as `cybernav_mono.ttf`, and OsmAnd's `FontCache` builds its normal and medium fonts from it.
- **Chakra Petch** is the style guide's heading face. It is not bundled in the app yet.
- Labels uppercase. "cyberNAV" is always spelled that way: `cyber` lowercase, `NAV` uppercase.

## Map

- **Night (default):** black ground; no land, water, parks, labels, POI icons, paths, rail or rivers. Main roads thin green lines, side streets softer green, route yellow with green turn arrows, wireframe 3D buildings. Bookmarks, route and your position still show.
- **3D buildings:** on by default, far view distance (maximum), detailed (building parts). Short buildings drawn taller (h + 7·e^(−h/12) m) so low suburbs still read as 3D. Edges about 3 px.
- **Camera:** chase cam about 45° down from behind and above the vehicle (Unit 01 reference). Map rotates with the direction of travel, never the compass. Close auto-zoom while driving. Always opens in 3D.
- **Motion:** glides between GPS fixes; Android Auto at 60 fps.

## Driving screen (Unit 01 HUD)

Layout: sidebar on the left in landscape, along the top in portrait. Sidebar order is Aurora's:

1. Header: cyberNAV, destination (or STANDBY), GPS status.
2. Route search bar (replaces the concept's clock). On a route it shows `ETA NEXT / END` as arrival clock times.
3. ADD STOP (inserted before the next destination) and ADD ENDPOINT (appended last). On a route only.
4. Speed limit (round sign; red-orange when more than 5% over) + current street + next street and distance.
5. Heading-up route minimap: route ahead yellow, driven part dimmed, destination as a blinking ring, old route dashed for 90 s after a reroute.
6. Buttons: MENU, CENTER, DAY / NIGHT, VEHICLE, THEME, STOCK UI, plus START (route ready) and STOP (on a route). Two rows on a portrait phone when there are more than five; a bar under the map when a landscape sidebar is too short.

On the map: next turn (arrow, distance, street) or an alert; heading tape; ETA + distance (on a route only); status line (STANDBY, ROUTE READY, FOLLOW ROUTE, OFF ROUTE, RECALCULATING, ARRIVING); round re-centre ring bottom left (centre dot lit while following); CRT overlay (scanlines, light vignette, corner brackets).

Alerts are see-through with outlined text:
- **ARRIVING** (blinking) under 250 m from the next stop or destination: distance, side of the road, `PULL TO CURB`.
- **ROUTE OBSTRUCTED** (blinking, red): cause (`OFF ROUTE · FINDING A NEW WAY` or `ROUTE CHANGED`) and a spinning `RECALCULATING`.

There is no speedometer (removed on request; the speed limit replaces it).

## Vehicles

Ten original, generic designs from Vehicle Select (no brands or franchise shapes): Meridian (sedan, default), Talon (reverse trike), Rancher (pickup / ute), Courier (van), Strider (motorcycle), Shuttle (shuttlecraft, hovers), Prospector (six-wheel rover), Haulmaster (semi tractor, shaped after a Windrose-style EV prime mover), Lancet (sports car), Metro (bus). Geometry lives in `osmand-skin/vehicles/make_vehicles.py` (and in the handoff for the canvas renderer).

## Where shipped differs from the concepts (intentional)

| Concept | Shipped | Why |
| --- | --- | --- |
| Clock block in the sidebar | Route search bar + ETA NEXT / END | Aurora's sidebar order (v0.0.17). |
| Vehicle in the phosphor colour | Yellow body, black lines | Aurora (v0.0.22). |
| `ground` #020503 map | Pure black #000 | Cold minimal look (v0.0.14). |
| Map labels in muted phosphor | No labels at night | "Almost no labels" (v0.0.14). |
| Chakra Petch headings | Share Tech Mono everywhere | Only one face bundled so far. |
| Sky-corridor / hover mode, altitude ladder | Not built | Concept only. |
