# cyberNAV skin for OsmAnd

This folder turns **[OsmAnd](https://github.com/osmandapp/OsmAnd)** (GPLv3, © OsmAnd BV and contributors) into cyberNAV. It holds only the skin and a build script. OsmAnd's source is downloaded at build time at the commits pinned in [`versions.env`](versions.env).

## What the skin changes

| Area | Change | File |
| --- | --- | --- |
| Map | Night map is cold and minimal: pure black ground (areas, water, sky and fog all black), main roads in phosphor green #B8FF7A, side streets softer #668E44, yellow route, no labels, icons, paths, rails or rivers; buildings still draw. The light (day) map keeps every colour of OsmAnd's default style on a phosphor ink-on-paper ramp. | `recolor.py render` (`minimal_night`), `apply.sh` step 3 |
| Map view | Turns with the direction of travel (not compass) and always opens in a chase-cam 3D view looking down at 45° (the Unit 01 concept screen) (a saved flat view is not restored), with Close auto-zoom while driving, on the phone and in Android Auto. | `apply.sh` step 3a |
| Smooth motion | While driving the map glides continuously between GPS fixes (each glide lasts 20% longer than the usual gap, so it never stalls), and Android Auto draws at 60 fps instead of 20. | `apply.sh` step 3b |
| Day/night | Two map looks: the night HUD (phosphor on black) and a light mode for daylight (dark phosphor ink on pale paper). Map mode defaults to Night (phone and Android Auto); a DAY / NIGHT button on the map HUD flips it, and Configure map > Map mode offers Day, Night, Auto and Light sensor. Android Auto's own Day/Night setting can be set to follow the car. The app UI stays dark. | `recolor.py`, `apply.sh` step 3, `CyberMigrate.java` |
| 3D buildings | On by default. Far view distance and detailed level (building parts). Wireframe: edge lines (about 3 px wide) in OsmAnd's 3D buildings colour (default phosphor green; Configure map > 3D buildings > Colour, with green / red-orange / orange first in the palette) on near-black, opaque faces (hidden lines stay hidden). Short buildings drawn taller (h + 7·e^(−h/12) m). Done by patching the building shaders inside OsmAnd's prebuilt map engine. | `core/patch_core.py`, `apply.sh` steps 3 and 8 |
| Map screen HUD | After the Unit 01 concept screen: CRT overlay (scanlines, vignette, corner brackets; never takes touches), Share Tech Mono for OsmAnd's text (assets/fonts, OFL 1.1), speed limit and clock in the left widget column, on by default when driving. | `src/.../CyberHud.java`, `apply.sh` step 11 |
| Driving screen | Custom Unit 01 HUD in place of OsmAnd's buttons and widgets: sidebar with route search (on a route: next-stop / route ETA), ADD STOP (inserted before the next destination) and ADD ENDPOINT (appended last), speed limit, street, heading-up route minimap and MENU / CENTER / DAY-NIGHT / VEHICLE / THEME / STOCK UI / START / STOP; on the map the next turn (or an ARRIVING / ROUTE OBSTRUCTED · RECALCULATING alert), heading tape, ETA / distance and a status line. STOCK UI switches back to OsmAnd's screen. | `src/.../CyberDrive.java`, `apply.sh` steps 9 and 11 |
| Vehicle marker | The ten CyberNav Vehicle Select designs as 3D models: black faces plus phosphor beams along every crease and detail line, generated at build time and bundled as OsmAnd models (`model_cybernav_<id>`). Car default Meridian; VEHICLE button on the driving screen to switch. Model shader patched to flat colours. | `vehicles/make_vehicles.py`, `apply.sh` step 8b, `core/patch_core.py` |
| Phosphor themes | Green / Amber / Ice / White from the THEME button. Sets the HUD ink, the vehicle colour (edge material `*_profile_color` takes the profile colour), the custom 3D buildings colour and the hidden `cybernavTheme` render property that recolours the night road lines. | `src/.../CyberTheme.java`, `recolor.py` |
| App UI | Dark theme by default; dark-theme greys and accent colours moved to the HUD palette. | `recolor.py colors` |
| Updates | On launch (at most hourly) checks the latest GitHub release; if its `build=N` (the N in v0.0.N) is newer than the installed versionCode, shows a HUD prompt (Install / Later / Skip), downloads the APK and opens Android's installer. Android asks once to allow installs from cyberNAV. | `src/.../CyberUpdater.java`, `apply.sh` step 6 |
| First run | When OsmAnd's start wizard finds your region's map and your country has several maps, a HUD prompt offers **Whole country** (all maps, total size) or **Just this region**. | `src/.../CyberCountry.java`, `apply.sh` step 7 |
| Adding stops | Any "add stop / intermediate point" action appends the stop as the new final destination; the old destination becomes the last stop. Replace destination still replaces; stops can still be reordered in the route's waypoint list. | `apply.sh` step 9 |
| Name and icon | App name "cyberNAV", app id `net.faradaymicrosystems.cybernav` (installs next to OsmAnd), wireframe navigation icon. | `apply.sh` steps 2 and 5 |

Navigation behaviour is OsmAnd's own and is not modified.

## Build

GitHub Actions does it: [`.github/workflows/osmand.yml`](../.github/workflows/osmand.yml) checks out OsmAnd, OsmAnd-resources, OsmAnd-core, OsmAnd-core-legacy and OsmAnd-build side by side, runs `apply.sh android resources`, then `./gradlew assembleNightlyFreeOpenglArm64Debug`, and publishes the APK as a release named `cyberNAV v0.0.N` (one higher per release, notes list the commits; history in `CHANGELOG.md`).

Locally, with the same folder layout and the Android SDK + NDK installed:

```
bash osmand-skin/apply.sh android resources
cd android && ./gradlew assembleNightlyFreeOpenglArm64Debug
```

To update OsmAnd, change the commits in `versions.env`. `apply.sh` checks each edit and stops with a clear message if OsmAnd moved something.

## Licence

GPLv3, same as OsmAnd ([LICENSE](LICENSE)). OsmAnd's artwork is CC-BY-NC-ND 4.0, so builds must not be sold or used commercially. cyberNAV is not affiliated with OsmAnd BV.
