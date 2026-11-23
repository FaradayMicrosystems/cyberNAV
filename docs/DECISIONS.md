# cyberNAV decisions log

Every decision that shaped the app, newest first within each section, with the reason. "Aurora" means the project owner decided it. When a later decision replaced an earlier one, both are listed so nobody re-tries the old one.

## Direction

| Date | Decision | Why |
| --- | --- | --- |
| 23 Nov 2026 | Plan a full rebuild without OsmAnd (custom UI and engine): [REBUILD-PLAN.md](REBUILD-PLAN.md). Plan only; the OsmAnd build keeps shipping. | Aurora's request after this documentation review. |
| 16 Nov 2026 | Own-UI plan (hide all stock OsmAnd UI; own search, saved places, route planner, downloads, settings, weather) **paused** until Aurora says go. | Aurora. |
| 16 Nov 2026 | After v0.0.20, aim to hide all stock OsmAnd UI and keep only its engine (render, routing, voice, offline maps). Build own versions of OsmAnd's paid extras (e.g. weather) independently with free data, never by unlocking OsmAnd's paid code. | Aurora; legal and licence hygiene. |
| 1 Nov 2026 | Fork OsmAnd (GPLv3) and reskin it, instead of building navigation from scratch. The custom prototype is kept as a fallback. | Aurora only wants to do the skin, not navigation logic. OsmAnd gives offline maps, routing, voice, search and Android Auto for free. |
| 1 Nov 2026 | Repo `FaradayMicrosystems/cyberNAV`, public. | Aurora. |
| 1 Nov 2026 | Original build plan recommended Mapbox Navigation SDK ([PLAN.md](PLAN.md)). Not taken. | Superseded by the OsmAnd fork. |

## Naming and versioning

| Date | Decision | Why |
| --- | --- | --- |
| 1 Nov 2026 | Name is always **cyberNAV** (`cyber` lowercase, `NAV` uppercase). Release and app titles are just that; OsmAnd is credited in the README only. | Aurora. |
| 1 Nov 2026 | Every change is its own release, last number +1 (v0.0.6, v0.0.7, …). v0.6 renamed v0.0.6. versionCode = N. | Aurora; also project release rule 2. |
| 1 Nov 2026 | Every change logged in `CHANGELOG.md`; the same text is the release notes. | Aurora; release rule 3. |
| 15 Nov 2026 | Claude merges its own PRs once CI passes; do not ask Aurora to merge. | Aurora. |
| — | Notify Aurora when builds are done. | Aurora. |

## Map look

| Version / date | Decision | Why |
| --- | --- | --- |
| v0.0.15 (15 Nov) | Wireframe buildings in the **same phosphor green as the roads** (#B8FF7A), replacing bright orange. | Aurora, after testing: one colour on screen except the yellow route. |
| v0.0.16 | Building colour exposed as a setting (green / red-orange / orange presets). | Lets Aurora compare without a rebuild. |
| v0.0.14 (15 Nov) | Cold minimalist "aesthetic nav device", not a full map: pure black ground, main roads phosphor green, side streets softer green, route yellow, almost no labels. | Aurora. |
| v0.0.14 | 3D sky and fog black (were navy). | They tinted the black map blue. |
| v0.0.8 | 3D buildings on by default, far view distance (maximum), detailed parts. | Aurora. |
| v0.0.8 | Bright orange building edges. **Replaced in v0.0.15.** | Green looked yellow over the old style. |
| v0.0.6 | Wireframe buildings with opaque black faces; short buildings boosted taller. | Aurora's feature list. |
| v0.0.9 | Light (day) mode exists, but Night is the default (since v0.0.14). | Readability in sunlight; Aurora prefers night. |

## Camera

| Version | Decision | Why |
| --- | --- | --- |
| v0.0.15 | Chase cam about **45° down** from behind and above, per the Unit 01 reference. | Aurora's reference screen. |
| v0.0.14 | Low chase cam 15° above the horizon. **Replaced.** | Too low. |
| v0.0.11 | 35° from straight down. **Replaced.** | |
| v0.0.7 | Map turns with **direction of travel, never compass**; always opens in 3D. | Aurora. |
| Handoff | Rejected camera variants: the original very low chase cam, a 300 m pull-back (vehicle hidden), a 60 m pull-back (buildings fill the frame). | Don't retry these. |

## Driving screen and HUD

| Version | Decision | Why |
| --- | --- | --- |
| v0.0.17 | Custom HUD replaces OsmAnd's widgets. Sidebar order: route search bar (replaces clock); ETA next stop / route end as clock times; ADD STOP (before next destination) + ADD ENDPOINT (last); speed limit + street; minimap; buttons. STOCK UI toggles back. | Aurora's order. |
| v0.0.20 | Speed readout removed; speed limit replaces it. | Concept and Aurora. |
| v0.0.20 | Phosphor themes Green / Amber / Ice / White. | Handoff. |
| v0.0.20 | Search bar must enter route planning mode first. | Fixed the v0.0.17–v0.0.19 bug where a picked destination never got a route. |
| v0.0.23 | Night legibility: bigger, brighter labels, solid thicker panel outlines, lighter scanlines and vignette. | Too dim on the black map. |
| v0.0.6 | New stops append to the end of the route (old destination becomes the last stop). | Aurora. |

## Vehicles

| Version | Decision | Why |
| --- | --- | --- |
| v0.0.22 | **All vehicles solid route-yellow with black wireframe lines in every theme**; themes no longer colour the vehicle. Haulmaster reshaped after a Windrose-style EV prime mover. | Aurora. |
| v0.0.19 | Ten Vehicle Select designs as 3D OsmAnd models; Meridian default; VEHICLE button. | Handoff. |
| Handoff | All vehicles are original generic shapes; no brand or franchise names. Pip replaced by Talon, Skiff by Shuttle. | IP safety; Aurora's picks. |

## Other behaviour

| Version | Decision | Why |
| --- | --- | --- |
| v0.0.12 | Natural voice: phone TTS at normal pitch/speed, best offline voice, Google TTS over eSpeak/Pico. | OsmAnd's default prompts sounded robotic. |
| v0.0.13 | Smooth motion (glide 1.2× average fix gap) and Android Auto at 60 fps. | Map moved in steps. |
| v0.0.6 | In-app updater from GitHub Releases. | Release rule 4. |
| v0.0.6 | First run offers the whole country. | Aurora. |
