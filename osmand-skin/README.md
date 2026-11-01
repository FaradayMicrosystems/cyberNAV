# cyberNAV skin for OsmAnd

This folder turns **[OsmAnd](https://github.com/osmandapp/OsmAnd)** (GPLv3, © OsmAnd BV and contributors) into cyberNAV. It holds only the skin and a build script. OsmAnd's source is downloaded at build time at the commits pinned in [`versions.env`](versions.env).

## What the skin changes

| Area | Change | File |
| --- | --- | --- |
| Map | Every colour in OsmAnd's default map style is moved onto the Phosphor HUD green ramp: dark ground, dim areas, bright roads, labels and route. Red warnings stay red. | `recolor.py render` |
| Day/night | Always night palette, on the phone and in Android Auto (the HUD is night-only). | `apply.sh` step 3b |
| 3D buildings | On by default. Wireframe: phosphor edge lines on near-black, opaque faces (hidden lines stay hidden). Short buildings drawn taller (h + 7·e^(−h/12) m). Done by patching the building shaders inside OsmAnd's prebuilt map engine. | `core/patch_core.py`, `apply.sh` steps 3 and 8 |
| App UI | Dark theme by default; dark-theme greys and accent colours moved to the HUD palette. | `recolor.py colors` |
| Updates | On launch (at most hourly) checks the latest GitHub release; if its `build=N` (the N in v0.N) is newer than the installed versionCode, shows a HUD prompt (Install / Later / Skip), downloads the APK and opens Android's installer. Android asks once to allow installs from cyberNAV. | `src/.../CyberUpdater.java`, `apply.sh` step 6 |
| First run | When OsmAnd's start wizard finds your region's map and your country has several maps, a HUD prompt offers **Whole country** (all maps, total size) or **Just this region**. | `src/.../CyberCountry.java`, `apply.sh` step 7 |
| Adding stops | Any "add stop / intermediate point" action appends the stop as the new final destination; the old destination becomes the last stop. Replace destination still replaces; stops can still be reordered in the route's waypoint list. | `apply.sh` step 9 |
| Name and icon | App name "cyberNAV", app id `net.faradaymicrosystems.cybernav` (installs next to OsmAnd), wireframe navigation icon. | `apply.sh` steps 2 and 5 |

Navigation behaviour is OsmAnd's own and is not modified.

## Build

GitHub Actions does it: [`.github/workflows/osmand.yml`](../.github/workflows/osmand.yml) checks out OsmAnd, OsmAnd-resources, OsmAnd-core, OsmAnd-core-legacy and OsmAnd-build side by side, runs `apply.sh android resources`, then `./gradlew assembleNightlyFreeOpenglArm64Debug`, and publishes the APK as a release named `cyberNAV v0.N` (v0.6 first, then one higher per release).

Locally, with the same folder layout and the Android SDK + NDK installed:

```
bash osmand-skin/apply.sh android resources
cd android && ./gradlew assembleNightlyFreeOpenglArm64Debug
```

To update OsmAnd, change the commits in `versions.env`. `apply.sh` checks each edit and stops with a clear message if OsmAnd moved something.

## Licence

GPLv3, same as OsmAnd ([LICENSE](LICENSE)). OsmAnd's artwork is CC-BY-NC-ND 4.0, so builds must not be sold or used commercially. cyberNAV is not affiliated with OsmAnd BV.
