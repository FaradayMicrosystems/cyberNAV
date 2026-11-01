# cyberNAV changelog

Every change gets its own version: v0.0.N, one higher per release. GitHub Actions picks the number and publishes each release with the list of commits it contains; this file keeps the human-readable history. Downloads: https://github.com/FaradayMicrosystems/cyberNAV/releases

## v0.0.11 (2026-11-01)

- Gentler 3D angle: the map tilts 35° from straight down instead of 50°, on the phone and in Android Auto (also applied once on upgrade).

## v0.0.10 (2026-11-01)

- Fix: the 3D map engine now draws with the cyberNAV map style (phosphor at night, light mode by day). It used OsmAnd's own built-in copy of the style before, so the map kept OsmAnd's stock colours. CI now checks this.

## v0.0.9 (2026-11-01)

- Light mode for daylight: the map in dark phosphor ink on pale paper, alongside the night HUD.
- Map mode defaults to Auto (light by day, night HUD after sunset); a DAY / NIGHT button on the map flips it by hand. Configure map > Map mode also offers Day, Night and Light sensor.
- Android Auto switches with the car's day/night (or its own Day/Night setting) instead of always night.

## v0.0.8 (2026-11-01)

- Map always opens in 3D perspective, also after upgrading from an older version (a saved flat view is no longer restored).
- Wireframe building edges are bright orange (were phosphor green, which looked yellow).
- 3D buildings default to the far (maximum) view distance and the detailed level (building parts), also applied once on upgrade.

## v0.0.7 (2026-11-01)

- Map turns with the direction of travel instead of the compass, on the phone and in Android Auto.
- Map opens tilted into a 3D perspective (about 50° from flat).
- Versioning: every change gets its own version (v0.0.N) and this changelog; v0.6 renamed to v0.0.6.

## v0.0.6 (2026-11-01)

First release of cyberNAV built on [OsmAnd](https://github.com/osmandapp/OsmAnd) (see README for credits and licence).

- Phosphor HUD look: recoloured map style, night palette everywhere, dark HUD app theme, wireframe navigation icon, name "cyberNAV".
- Wireframe 3D buildings (phosphor edges, solid dark faces) and taller short buildings.
- In-app updates from GitHub releases.
- First run: download the whole country or just your region.
- New stops are added at the end of the route.
- Releases are signed with one fixed key and always have a higher version, so they install over the previous one.

## Earlier

- Custom-engine prototype (`simulator/`, `android/`), release `prototype-latest`. Kept as a fallback.
