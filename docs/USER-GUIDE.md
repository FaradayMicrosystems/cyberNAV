# cyberNAV user guide

For v0.0.24. cyberNAV runs on Android phones (arm64) and in Android Auto.

## Install and update

1. On the phone, open https://github.com/FaradayMicrosystems/cyberNAV/releases/latest and download `cyberNAV-v0.0.N.apk`.
2. Open it and allow installs from your browser when Android asks.
3. Open **cyberNAV** and allow location.

After that, cyberNAV checks for new versions itself (at most once an hour, when the map opens). When one is out it shows **Install / Later / Skip**. Install downloads it and opens Android's installer; the first time, Android asks you to allow installs from cyberNAV. Every version installs over the last one and keeps your maps and settings.

cyberNAV installs next to OsmAnd if you have it; they don't share data.

## First run: maps

cyberNAV works offline. On first run it finds your region's map. If your country is split into several maps, it asks:
- **Whole country** downloads all of them (shows the total size), or
- **Just this region**.

More maps: MENU > Maps & Resources (OsmAnd's download screen).

## The driving screen

This is what you see over the map. On a phone held sideways the panel is on the left; held upright it runs along the top.

| Item | What it does |
| --- | --- |
| Header | Your destination, or STANDBY. GPS status. |
| Search bar | Tap, type a place or address, pick it, press **Start**. On a route it shows arrival times at your next stop and at the end (`ETA NEXT / END`). |
| **ADD STOP** | Adds a stop *before* your next destination (a detour on the way). |
| **ADD ENDPOINT** | Adds a stop as the new *last* point of the trip. |
| Speed limit | The limit on this road. Turns red-orange when you are more than 5% over. Next to it: the street you are on, the next street and the distance to it. |
| Minimap | Route ahead in yellow, heading up. Destination is a blinking ring. After a reroute the old route stays as a dashed line for 90 seconds. |
| **MENU** | OsmAnd's main menu: settings, maps, favourites, trip recording and everything else. |
| **CENTER** | Back to your position, following it again. The round ring at the bottom left of the map does the same; its centre dot is lit while the map follows you. |
| **DAY / NIGHT** | Night: black phosphor map. Day: ink-on-paper map for sunlight. |
| **VEHICLE** | Choose your vehicle marker from ten designs. |
| **THEME** | Green, Amber, Ice or White phosphor. The route stays yellow and alerts stay red. |
| **STOCK UI** | Switches to OsmAnd's own screen with its buttons. Tap **◇ HUD** at the top to come back. |
| **START** | Appears when a route is ready. Starts turn-by-turn guidance. |
| **STOP** | Ends the route. |

On the map: the next turn (arrow, distance, street), a heading tape, ETA and distance left, and a status line (STANDBY, ROUTE READY, FOLLOW ROUTE, OFF ROUTE, RECALCULATING, ARRIVING). Drag the map anywhere outside the panels to look around.

### Alerts

- **ARRIVING** blinks within 250 m of your next stop or destination, with the distance and which side of the road it is on.
- **ROUTE OBSTRUCTED** blinks red when you leave the route or the route changes, with **RECALCULATING** while a new way is found.

## Voice

Turn-by-turn prompts use your phone's text-to-speech voice at normal pitch and speed, using the best offline voice installed for your language. If your phone's speech engine is an old robotic one and Google Speech Services is installed, cyberNAV uses Google's voice. Change it in MENU > Settings > Navigation > Voice prompts, or in Android's Text-to-speech settings.

## Settings worth knowing

- **3D building colour:** Configure map > 3D buildings > Colour (green, red-orange and orange are first in the palette). The THEME button also sets it.
- **Map mode:** Configure map > Map mode: Day, Night, Auto or Light sensor. Night is the default.
- **Android Auto day/night:** in OsmAnd's Android Auto settings; Night by default.

## Android Auto

cyberNAV appears in the car's app launcher. Sideloaded apps need Android Auto's developer mode: Android Auto settings > tap **Version** about 10 times > ⋮ > Developer settings > **Unknown sources** on.

In the car you get the cyberNAV map (black phosphor style, wireframe buildings, your vehicle, smooth 60 fps motion) with Android Auto's own search, route and guidance cards. The cyberNAV driving-screen panel is phone-only.

## Licence and credits

cyberNAV is built on OsmAnd (GPLv3). Map data © OpenStreetMap contributors. Not for commercial use (OsmAnd's artwork licence). See the README.
