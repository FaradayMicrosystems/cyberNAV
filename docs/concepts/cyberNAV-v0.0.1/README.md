# cyberNAV v0.0.1: HUD layout concept

Pre-alpha concept for the in-car navigation screen. These are design mockups, not app code.

Open `index.html` in a browser to see the four screens animated.

## Layout

- **Left sidebar (solid panel), top to bottom:** CyberNav logo, local time and date, speed limit with the current street, plan-view mini map.
- **Main map:** chase view with the camera 100 m above the vehicle, about 15 to 22 m behind it, with a wide lens. Buildings are kept low and the route is always drawn on top so it stays readable.
- **Route alerts:** upper left of the map, on a transparent background (next turn, arriving, route obstructed and rerouting).
- **Secondary readouts:** heading tape at the top right, ETA and distance at the bottom right, and the altitude ladder on the right edge for the sky-lane screen.

## Screens

| File | Screen |
| --- | --- |
| `01-ground-next-turn.png` | Ground car, next turn right in 86 m |
| `02-sky-corridor.png` | Hover craft in an elevated corridor |
| `03-arriving.png` | Arrival with a destination beacon |
| `04-reroute-alert.png` | Blocked intersection and a new route |

Street names, speed limits and readouts are placeholders.
