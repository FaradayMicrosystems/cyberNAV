# cyberNAV

A navigation app with a retrofuturistic phosphor-CRT look, built for the phone and Android Auto.

## Based on OsmAnd

The main cyberNAV app is **[OsmAnd](https://github.com/osmandapp/OsmAnd)** (OSM Automated Navigation Directions, © OsmAnd BV and contributors, [osmand.net](https://osmand.net)) with a Phosphor HUD skin applied on top. OsmAnd supplies the navigation: offline maps, routing, turn-by-turn voice guidance, search, 3D buildings and Android Auto. cyberNAV only changes how it looks and what it is called.

- OsmAnd source: https://github.com/osmandapp/OsmAnd (release branch r5.4, pinned in [`osmand-skin/versions.env`](osmand-skin/versions.env)), with [OsmAnd-resources](https://github.com/osmandapp/OsmAnd-resources), [OsmAnd-core](https://github.com/osmandapp/OsmAnd-core), [OsmAnd-core-legacy](https://github.com/osmandapp/OsmAnd-core-legacy) and [OsmAnd-build](https://github.com/osmandapp/OsmAnd-build).
- Licence: OsmAnd's code is **GPLv3**, so cyberNAV's OsmAnd build and the skin in [`osmand-skin/`](osmand-skin/) are GPLv3 too ([`osmand-skin/LICENSE`](osmand-skin/LICENSE)). OsmAnd's artwork is CC-BY-NC-ND 4.0: no commercial use.
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
- cyberNAV is not affiliated with or endorsed by OsmAnd BV, and it doesn't use the OsmAnd name or logo.

**Download:** https://github.com/FaradayMicrosystems/cyberNAV/releases/tag/cybernav-osmand-latest (built by GitHub Actions from [`osmand-skin/`](osmand-skin/)).

```
CYBERNAV // NAV PLOT LIVE
```

| Path | What |
| --- | --- |
| [`osmand-skin/`](osmand-skin/) | **The cyberNAV app:** Phosphor HUD skin and build script for OsmAnd |
| [`docs/PLAN.md`](docs/PLAN.md) | Build plan for the Android Auto navigation app |
| [`docs/phosphor-hud/`](docs/phosphor-hud/) | Copy of the Phosphor HUD style guide (tokens, components, map styling) |
| [`docs/TESTING.md`](docs/TESTING.md) | How to try it: browser, APK, Android Auto, and the test suites |
| `simulator/` | *Earlier custom prototype (fallback):* shared navigation core (routing, guidance, GPS handling, Android Auto template model) plus the phone and car UIs, runnable in a browser |
| `android/` | *Earlier custom prototype (fallback):* Android app with the phone UI in a WebView, and an Android Auto navigation app that draws the same map on the car surface |

**Earlier custom prototype** (own engine, kept as a fallback; `simulator/` and `android/`): https://github.com/FaradayMicrosystems/cyberNAV/releases/tag/prototype-latest

Style source of truth: https://claude.ai/artifact/3L6JbU7PhNtWVkihiVy6hq
