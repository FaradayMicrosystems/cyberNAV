# cyberNAV changelog

Every change gets its own version: v0.0.N, one higher per release. GitHub Actions picks the number and publishes each release with the list of commits it contains; this file keeps the human-readable history. Downloads: https://github.com/FaradayMicrosystems/cyberNAV/releases

## v0.0.20 (2026-11-16)

- Phosphor themes: Green, Amber, Ice and White. The new THEME button on the driving screen switches between them. One theme colours the HUD, the CRT corner brackets, your vehicle, the 3D building edges and the road lines (side streets in a dimmer tone of the same colour). The route stays yellow and alerts stay red in every theme. Your choice is remembered.
- Route alerts on the map, in place of the next-turn panel. They are see-through, with outlined text, like the handoff design:
  - ARRIVING (blinking) within 250 m of your next stop or destination, with the distance and which side of the road it is on, and "PULL TO CURB";
  - ROUTE OBSTRUCTED (blinking, red) with the cause ("OFF ROUTE · FINDING A NEW WAY" or "ROUTE CHANGED") and a spinning RECALCULATING indicator while a new route is found.
- Minimap: the destination is a blinking ring, and after a reroute the old route stays on it as a dashed line for 90 seconds.
- The speed readout is gone from the map; the speed limit in the sidebar replaces it. The bottom readout now shows ETA and distance left, on a route only.
- The status line gains ARRIVING.

## v0.0.19 (2026-11-16)

- Your position on the map is now a CyberNav vehicle: a 3D phosphor-green wireframe with black faces that turns and tilts with the chase cam. The default is Meridian, the sedan.
- New VEHICLE button on the driving screen. It picks from the ten vehicles of the CyberNav Vehicle Select design: Meridian (sedan), Talon (reverse trike), Rancher (pickup / ute), Courier (van), Strider (motorcycle), Shuttle (shuttlecraft), Prospector (six-wheel rover), Haulmaster (semi tractor), Lancet (sports car) and Metro (bus).
- 3D markers are drawn with flat colours, without the white highlight, so the wireframe stays green.

## v0.0.18 (2026-11-16)

- Fix: the driving screen's buttons now work. Taps lit up but never ran their action, because the screen redraws every half second and each redraw made the tap check fail. Route search, ADD STOP, ADD ENDPOINT, MENU, CENTER, DAY / NIGHT, STOCK UI, STOP and ◇ HUD now all open their screens.
- MENU opens OsmAnd's main menu, the same one as the stock menu button.
- New START button when a route is ready but navigation hasn't started.
- Thicker 3D building lines: the wireframe edges are about twice as wide.

## v0.0.17 (2026-11-15)

Custom Unit 01 driving screen. It replaces OsmAnd's own buttons and widgets on the map screen.
- Sidebar (left in landscape, along the top in portrait), from top to bottom:
  - the cyberNAV header with your destination (or STANDBY) and the GPS status;
  - the route search bar where the clock was: tap it, type a place or address, then press Start;
  - on a route, the bar shows the arrival time at your next stop and at the end of the route ("ETA NEXT / END");
  - ADD STOP and ADD ENDPOINT, on a route only. ADD STOP puts the new stop between you and your next destination. ADD ENDPOINT adds it as the last point of the journey;
  - the speed limit (turns red-orange when you are more than 5% over it), the street you are on, and the next street with the distance to it;
  - a heading-up route minimap with the route ahead in yellow and the part already driven dimmed;
  - MENU, CENTER, DAY / NIGHT, STOCK UI and, on a route, STOP buttons.
- On the map:
  - the next turn: an arrow, the distance and the street;
  - a heading tape;
  - ETA, distance left and speed;
  - a status line: STANDBY, ROUTE READY, FOLLOW ROUTE, OFF ROUTE or RECALCULATING.
- STOCK UI brings OsmAnd's own screen back. Tap ◇ HUD at the top to return.
- Touches outside the panels still move the map.

## v0.0.16 (2026-11-15)

- Building colour is now a setting: Configure map > 3D buildings > Colour. The first three colours in the palette are phosphor green (default), red-orange (#FF6B3D) and bright orange (#FF7300); any other colour works too.

## v0.0.15 (2026-11-15)

Map screen modelled on the "Unit 01 · CyberNav · P1 green" concept screen.
- Chase-cam view like the concept: the camera looks down at 45° from behind and above the vehicle (was 15° above the horizon in v0.0.14). Applied once on upgrade.
- 3D wireframe buildings are drawn in the same phosphor green as the roads and HUD (#B8FF7A, were bright orange), still with opaque black faces, so the whole screen is one colour except the yellow route.
- CRT look over the map screen: fine scanlines, a dark vignette at the edges and phosphor corner brackets. It never blocks touches.
- HUD text in Share Tech Mono, the cyberNAV data font (SIL Open Font License).
- Left column while driving: next turn and distance, then the speed limit and the clock (both now on by default for car profiles). Arrival time and distance stay along the bottom.

## v0.0.14 (2026-11-15)

- Cold, minimal night map: the ground is pure black (#000). Land, water, parks and every other area are no longer drawn, and the 3D sky and distance fog, which OsmAnd's engine tinted navy blue, are black too.
- Main roads (motorways, trunk, primary, secondary, tertiary) are thin lines in the cyberNAV phosphor green (#B8FF7A); side streets (residential, service, tracks and similar) are the same green, softer (#668E44). Footpaths, cycleways, railways, rivers and borders are hidden.
- The active route is a yellow line (#FFDF3D) with green turn arrows.
- No street names, place names, POI icons or other labels on the night map. Bookmarks, the route and your position still show.
- 3D buildings unchanged: bright orange wireframe with black faces.
- Low chase-cam view: the map tilts to 15° above the horizon (OsmAnd's lowest is 10°) and auto-zoom while driving is set to Close, so the view sits just above and behind the vehicle looking ahead. The map still turns with the direction of travel, not the compass.
- Night by default, on the phone and in Android Auto (was Auto, which showed the light map by day). The DAY / NIGHT button still switches to the light map. Applied once on upgrade.

## v0.0.13 (2026-11-14)

- Smooth motion while driving: the map now glides continuously with the vehicle instead of moving in chunks. Each glide between GPS fixes lasts a little longer than the usual gap, so the map no longer stops and lurches when a fix arrives late.
- Android Auto draws the map at 60 frames a second (was 20), so the car screen moves as smoothly as the phone.

## v0.0.12 (2026-11-14)

- Natural navigation voice: turn-by-turn prompts use the phone's own text-to-speech voice at normal pitch and normal speed, with the best-quality voice installed for your language (offline voices only, so prompts never drop out in a dead zone).
- If the phone's speech engine is an old robotic one (eSpeak or Pico) and Google Speech Services is installed, cyberNAV speaks with Google's voice instead.
- On upgrade, a recorded voice pack is switched once to the phone's voice. Any voice can still be picked under Settings > Navigation > Voice prompts > Language, and Android's Text-to-speech settings still choose the engine and voice.

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
