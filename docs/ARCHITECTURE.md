# cyberNAV architecture

How the shipping app is put together. Current as of v0.0.24 (23 Nov 2026).

## In one paragraph

cyberNAV is **OsmAnd r5.4 (GPLv3) plus a skin**. The repo does not contain OsmAnd's source. At build time CI checks out five OsmAnd repositories at pinned commits, runs `osmand-skin/apply.sh` to make small, checked edits to them, copies in our own Java classes (`net.osmand.plus.cybernav.*`), binary-patches the shaders of OsmAnd's prebuilt map engine, and builds one APK. OsmAnd does everything a navigation app has to do (offline vector maps, routing, guidance, voice, search, downloads, Android Auto). cyberNAV owns the look, the driving screen, and a handful of behaviour changes.

```
GitHub Actions (.github/workflows/osmand.yml)
│
├─ checkout cyberNAV (this repo)          → skin/
├─ checkout osmandapp/OsmAnd              → android/      ┐
├─ checkout osmandapp/OsmAnd-resources    → resources/    │ commits pinned in
├─ checkout osmandapp/OsmAnd-core         → core/         │ osmand-skin/versions.env
├─ checkout osmandapp/OsmAnd-core-legacy  → core-legacy/  │
├─ checkout osmandapp/OsmAnd-build        → build/        ┘
│
├─ download OsmAndCore_androidNativeRelease-5.4.aar  (native map engine, builder.osmand.net)
│    └─ core/patch_core.py  → shaders patched: wireframe buildings, taller short buildings, flat vehicle colours
├─ download OsmAndCore_android-5.4.aar  (engine's Java wrapper + resource bundle)
│
├─ apply.sh android resources <patched engine AAR>
│    ├─ recolor.py render   → default.render.xml (phosphor night map, paper day map, themes)
│    ├─ recolor.py colors   → app colours.xml (dark HUD palette)
│    ├─ make_vehicles.py    → 10 vehicle .obj/.mtl models in OsmAnd-resources/models
│    ├─ ~40 regex edits     → OsmAnd Java sources (defaults, hooks into our classes)
│    ├─ copies src/net/osmand/plus/cybernav/*.java, fonts, icons
│    └─ re-packs the map style into OsmAndCore_android.aar (the 3D engine reads it from there)
│
├─ ./gradlew assembleNightlyFreeOpenglArm64Debug   (~20 min)
├─ checks: signing cert SHA-256, app id + versionCode, engine style is cyberNAV
└─ gh release create v0.0.N  (push to cybernav-osmand only; PRs build but never publish)
```

## Repository layout

| Path | Role |
| --- | --- |
| `osmand-skin/apply.sh` | The build's heart. Numbered steps, each a checked regex edit (`edit` fails the build if a pattern is not found). Read it top to bottom to know everything cyberNAV changes in OsmAnd. |
| `osmand-skin/versions.env` | The five pinned OsmAnd commits (release branch r5.4). |
| `osmand-skin/recolor.py` | Map style and app colour rewrites. `render`: every colour onto the phosphor ramp at night, ink-on-paper ramp by day, then `minimal_night` strips the night map down (black ground, green roads, yellow route, buildings only) and adds the hidden `cybernavTheme` render property. `colors`: dark-theme palette. |
| `osmand-skin/core/patch_core.py` | Byte-patches GLSL shader text inside `libOsmAndCoreWithJNI.so` (same length or shorter, space-padded). Four patches: taller short buildings (vertex), wireframe walls (fragment), fallback building shader, flat-colour 3D marker shader. Each must match exactly once. |
| `osmand-skin/vehicles/make_vehicles.py` | Generates the ten vehicle models (geometry copied from the Vehicle Select design) as OsmAnd 3D location models `model_cybernav_<id>`: solid route-yellow body, black beams on every crease and detail line. Bump `VERSION` inside it when models change so installed copies are replaced. |
| `osmand-skin/src/net/osmand/plus/cybernav/` | Our Java classes, compiled into the app. See below. |
| `osmand-skin/assets/fonts/` | Share Tech Mono (OFL 1.1) as `cybernav_mono.ttf`. |
| `osmand-skin/res/` | Wireframe launcher icon. |
| `.github/workflows/osmand.yml` | Build, check and release workflow for the app. |
| `.github/workflows/android.yml` | Tests and APK for the earlier custom prototype (`simulator/`, `android/`). |
| `simulator/`, `android/` | Earlier custom prototype (own JS navigation core, WebView app, Android Auto). Not shipped; kept as a fallback and as reference for the rebuild ([REBUILD-PLAN.md](REBUILD-PLAN.md)). |
| `docs/` | This documentation set, the style guide copy and the design concepts. |

## Our Java classes

All in package `net.osmand.plus.cybernav`. Each is wired in by one or more `apply.sh` edits; the hook point is listed.

| Class | Lines | What it does | Hooked in at |
| --- | --- | --- | --- |
| `CyberDrive` | ~1,100 | The Unit 01 driving screen. One custom `View` drawn on a `Canvas` over the map (OsmAnd's `map_hud_container` is hidden while it is on). Sidebar: header, route search bar / ETA NEXT-END, ADD STOP / ADD ENDPOINT, speed limit + street, heading-up minimap, buttons. Map overlay: next turn or ARRIVING / ROUTE OBSTRUCTED alerts, heading tape, ETA / distance, status line, re-centre ring. Redraws every 0.5 s. Own hit-testing (`Hit` list); touches outside panels go to the map. Also owns `stopIndex()`, which decides where a new stop is inserted. | `MapActivity.onResume` (`attach`), `TargetPointsHelper.navigateToPoint` (`stopIndex`) |
| `CyberHud` | ~115 | Loads the HUD font (OsmAnd's `FontCache` builds its fonts from it) and adds the CRT overlay (scanlines, vignette, corner brackets) that never takes touches. | `OsmandApplication.onCreate`, `FontCache`, `MapActivity.onResume` |
| `CyberTheme` | ~95 | Phosphor themes Green / Amber / Ice / White. Sets HUD ink, the custom 3D buildings colour and the `cybernavTheme` render property. `INK`/`DIM` arrays must match `recolor.py THEMES`. | Called by `CyberDrive` |
| `CyberUpdater` | ~290 | In-app updates. On resume (at most hourly) reads `api.github.com/repos/FaradayMicrosystems/cyberNAV/releases/latest`, parses `build=N` from the notes, compares with versionCode, shows Install / Later / Skip, downloads with `DownloadManager`, opens the installer. | `MapActivity.onResume` |
| `CyberCountry` | ~115 | First run: offers "Whole country" vs "Just this region" when OsmAnd's wizard finds a region that is part of a multi-map country. | `FirstUsageWizardFragment` |
| `CyberMigrate` | ~100 | One-time settings migrations for upgrades (`cybernav_migrate` prefs: v8, v11, v14, v15 keys). Adds the DAY / NIGHT custom map button. | `MapActivity.onCreate`, `onResume` |
| `CyberVoice` | ~160 | Natural TTS: switches eSpeak/Pico to Google TTS if installed, normal pitch and rate, best offline voice, one-time recorded-pack → TTS migration. | `JsTtsCommandPlayer` |

## Behaviour changes made by `apply.sh` (summary)

| Step | Change |
| --- | --- |
| 1 | Map style recoloured (`recolor.py render`). |
| 2 | App name "cyberNAV", app id `net.faradaymicrosystems.cybernav` (installs next to OsmAnd). |
| 3 | Defaults: Night map on phone and Android Auto, black 3D sky and fog, dark app theme, 3D buildings on, building colour #B8FF7A custom, alpha 1.0. |
| 3a | Map rotates by travel bearing; elevation 45° (chase cam), never restores a flat view; Close auto-zoom for car. Far building distance, detailed building parts. `CyberMigrate.run` hook. |
| 3b | Smooth motion: glide between fixes = max(gap, running average gap) × 1.2; Android Auto `MAX_FRAME_RATE` 20 → 60. |
| 4 | App colours (`recolor.py colors`). |
| 5 | Launcher icon. |
| 6 | Copies our classes, `REQUEST_INSTALL_PACKAGES` permission, updater and DAY/NIGHT hooks. |
| 7 | First-run whole-country offer. |
| 8 | Patched engine AAR + map style packed into the engine's resource bundle. |
| 8b | Vehicle models; car default `model_cybernav_meridian`. |
| 9 | Stop insertion via `CyberDrive.stopIndex` (append as last; ADD STOP = before next destination). |
| 10 | `CyberVoice` hooks. |
| 11 | HUD font, CRT overlay, `CyberDrive.attach`, speed limit + clock widgets left/on for car, building colour presets first in palette. |

## Data flow at runtime (driving screen)

`CyberDrive.DriveView` builds a `State` snapshot from OsmAnd on each 0.5 s tick: last known location and bearing (`app.getLocationProvider()`), route state from `RoutingHelper` (following, route calculated, being calculated, deviated, next direction info, distance left overall and to the next stop, current max speed), target and intermediate points (`TargetPointsHelper`), and the street and off-route speed limit from the map-matched road segment (`getLastKnownRouteSegment()`). ARRIVING fires under 250 m to the next stop or destination; ROUTE OBSTRUCTED fires while following and deviated or recalculating. Actions call OsmAnd's own entry points: search enters route planning mode (if not already in it) and opens OsmAnd's quick search in destination or intermediate selection mode, MENU opens the dashboard or drawer, CENTER calls `backToLocationImpl()`, VEHICLE sets OsmAnd's `NAVIGATION_ICON` / `LOCATION_ICON` to a `model_cybernav_<id>`. So all logic stays OsmAnd's; `CyberDrive` is presentation plus a few calls.

## Persistent state we own

| Prefs file | Keys | Owner |
| --- | --- | --- |
| `cybernav` | `drive_hud` (driving screen on/off), `theme` | `CyberDrive`, `CyberTheme` |
| `cybernav_updater` | last check time, `skipped` build, `pending` download id | `CyberUpdater` |
| `cybernav_migrate` | `v8_buildings_tilt`, `v11_gentler_tilt`, `v14_black_chase_cam`, `v15_unit01_camera`, voice migration | `CyberMigrate`, `CyberVoice` |

Everything else (vehicle choice, building colour, day/night, downloaded maps, favourites) lives in OsmAnd's own settings.

## Where Android Auto fits

Android Auto is OsmAnd's own car app (`net.osmand.plus.auto`). It draws the map with the same engine and style, so the car screen gets the black phosphor map, wireframe buildings, vehicle and 60 fps motion. **The cyberNAV driving screen (`CyberDrive`) is phone-only**: the car shows OsmAnd's car templates (drawn by the Android Auto host).

## Licence boundaries

- OsmAnd code, and therefore the built APK and `osmand-skin/`: GPLv3.
- OsmAnd artwork (icons, some resources) in the APK: CC-BY-NC-ND 4.0, so no commercial use.
- Map data: OpenStreetMap, ODbL (attribution required).
- Share Tech Mono: SIL OFL 1.1.
