# cyberNAV skin for OsmAnd

This folder turns **[OsmAnd](https://github.com/osmandapp/OsmAnd)** (GPLv3, © OsmAnd BV and contributors) into cyberNAV. It holds only the skin and a build script. OsmAnd's source is downloaded at build time at the commits pinned in [`versions.env`](versions.env).

## What the skin changes

| Area | Change | File |
| --- | --- | --- |
| Map | Every colour in OsmAnd's default map style is moved onto the Phosphor HUD green ramp: dark ground, dim areas, bright roads, labels and route. Red warnings stay red. | `recolor.py render` |
| Day/night | Always night palette, on the phone and in Android Auto (the HUD is night-only). | `apply.sh` step 3b |
| 3D buildings | On by default, phosphor green at 35% opacity (OsmAnd's OpenGL renderer). | `apply.sh` step 3 |
| App UI | Dark theme by default; dark-theme greys and accent colours moved to the HUD palette. | `recolor.py colors` |
| Name and icon | App name "cyberNAV", app id `net.faradaymicrosystems.cybernav` (installs next to OsmAnd), wireframe navigation icon. | `apply.sh` steps 2 and 5 |

Navigation behaviour is OsmAnd's own and is not modified.

## Build

GitHub Actions does it: [`.github/workflows/osmand.yml`](../.github/workflows/osmand.yml) checks out OsmAnd, OsmAnd-resources, OsmAnd-core, OsmAnd-core-legacy and OsmAnd-build side by side, runs `apply.sh android resources`, then `./gradlew assembleNightlyFreeOpenglArm64Debug`, and publishes the APK as the `cybernav-osmand-latest` release.

Locally, with the same folder layout and the Android SDK + NDK installed:

```
bash osmand-skin/apply.sh android resources
cd android && ./gradlew assembleNightlyFreeOpenglArm64Debug
```

To update OsmAnd, change the commits in `versions.env`. `apply.sh` checks each edit and stops with a clear message if OsmAnd moved something.

## Licence

GPLv3, same as OsmAnd ([LICENSE](LICENSE)). OsmAnd's artwork is CC-BY-NC-ND 4.0, so builds must not be sold or used commercially. cyberNAV is not affiliated with OsmAnd BV.
