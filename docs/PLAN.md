# cyberNAV for Android Auto: build plan

Nov 1, 2026 · Aurora. Live, editable version: https://claude.ai/artifact/S8BMiJamkwF5ib1TRpS6Gp

## Summary

cyberNAV ships as one Android phone app that also projects a navigation screen to Android Auto, built in Kotlin on Google's Car App Library (navigation category). The car screen gets the Phosphor HUD look in full on the map itself and partly on the host-drawn cards, because Android Auto draws its own buttons and text panels for safety.

**Recommended stack:** Mapbox Navigation SDK v3 with its Android Auto extension for maps, routing, live traffic and search. Reason: it is the only option that gives real traffic, turn-by-turn and Android Auto support in one SDK while still letting us restyle every map layer (hatched water, dotted parks, glowing route) to the style guide.

**Decisions:**

- [ ] Map and routing provider: Mapbox (recommended), Google Navigation SDK, or a free open stack.
- [x] Prototype form: browser simulator of the car and phone screens plus an Android Studio project for the Android Auto Desktop Head Unit.
- [x] Where the code lives: this repo.

## How Android Auto constrains the design

Android Auto never runs our own UI on the car screen. The phone app hosts a `CarAppService`, and the car's host renders a small set of approved templates; navigation apps are the one category that may also draw a full-screen map surface. ([Android navigation guide](https://developer.android.com/training/cars/apps/navigation))

| Requirement | What it means for cyberNAV |
| --- | --- |
| Category `androidx.car.app.category.NAVIGATION` + permission `androidx.car.app.NAVIGATION_TEMPLATES` | Declared in the manifest; only navigation apps may use it. |
| Map surface (`SurfaceCallback`, surface permission) | We draw the entire map ourselves, so the Phosphor HUD style lives fully here. |
| Templates: `NavigationTemplate` (active guidance), `MapWithContentTemplate` (browse, search results, route preview) | The older `PlaceListNavigationTemplate` and `RoutePreviewNavigationTemplate` are deprecated since Car API level 7. |
| `NavigationManager`: `navigationStarted()`, `updateTrip(Trip)`, `navigationEnded()` | Feeds the instrument cluster and HUD with next turn and ETA. Rerouting uses `Trip.setLoading(true)`, not ending the trip. |
| Turn-by-turn notifications: ongoing, `CATEGORY_NAVIGATION`, `CarAppExtender` | Shows the next turn when another app is on screen. |
| Voice guidance with `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` and `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` | Music ducks under our prompts instead of stopping. |
| Alerts: max 2 actions, about 10 s | Used for "Faster route found" style prompts. |
| Navigation intents (quality rule NF-6) | "Navigate to" from Assistant and other apps must work. |
| Template quota and short task flows | Search and pick a destination in a few steps; no long menus while driving. |
| Optional cluster session (Car API 6+) | Draw a minimal map on the driver's cluster; map tiles only (NF-9). |

The same library also targets Android Automotive OS, so that port is cheap later.

## Architecture

One Kotlin app on the phone serves two surfaces: the car session for Android Auto and the normal phone UI, both on a shared navigation core.

```
Android Auto host (car screen) ──► Instrument cluster / HUD
        ▲  templates + map surface
        ▼
┌─ cyberNAV phone app (Kotlin) ─────────────────────────────┐
│  Car session (CarAppService)      Phone UI                │
│  search · preview · guidance      full map · panels       │
│  Phosphor HUD surface renderer    boot sequence · themes  │
│              └──────────┬──────────┘                      │
│  Shared core: routing, guidance, search, trip state,      │
│               one provider interface                      │
└───────────────────────────┬───────────────────────────────┘
                            ▼ network
              Map provider: Mapbox (prototype: OSM)
```

## Map data, routing, traffic and search

Recommendation: **Mapbox**. Its Android Auto extension bundles car-surface map rendering, Directions, active guidance, lane guidance, voice and Search. ([Mapbox Android Auto guide](https://docs.mapbox.com/android/navigation/guides/androidauto.md))

| Option | Live traffic | Android Auto support | Restyle to Phosphor HUD | Cost | Main catch |
| --- | --- | --- | --- | --- | --- |
| **Mapbox** | Yes | Built-in extension | Full | Free tier, then per user and trip | Vendor lock-in. |
| Google Navigation SDK + Places | Yes, best coverage | Supported | Partial | Per destination and Places call | Places content is generally licensed for display on Google's map. |
| Open stack: MapLibre + OSM + Valhalla | No (needs paid feed) | We build it | Full | Hosting only | No traffic, more engineering. |

Costs are from memory and need checking before launch. The prototype avoids paid keys and keeps the provider behind one interface.

## Feature scope against Google Maps

| Feature | Surface | Phase |
| --- | --- | --- |
| Search places and addresses, recent and saved (Home, Work) | Car + phone | 1 |
| Route preview with up to 3 alternatives, ETA and distance | Car + phone | 1 |
| Turn-by-turn guidance, voice, lane guidance, speed limit | Car + phone | 1 |
| Live traffic, automatic rerouting | Car + phone | 1 |
| Navigation intents | Car | 1 |
| Instrument cluster and HUD turn data | Car | 2 |
| Search along route (fuel, food, EV charging) | Car + phone | 2 |
| Incident reports and road closures | Car + phone | 2 |
| Offline maps | Phone | 2 |
| Walking, cycling, transit directions | Phone | 2 |
| Place details, hours, photos, reviews | Phone | 3 |
| Share live trip and ETA | Phone | 3 |
| Timeline and location history | Phone | 3 |
| Satellite and terrain layers (phosphor tinted) | Phone | 3 |
| Street View | Phone | Not planned (3D wireframe view instead) |

## Applying the Phosphor HUD style in the car

| Element | Who draws it | Style we can apply |
| --- | --- | --- |
| Map surface: grid, hatched water, dotted parks, roads, traffic patterns, glowing route, chevron | Us | Everything in `phosphor-hud/map-styling.md`. |
| Turn card, ETA strip, action strip, lists, search | Android Auto host | Host fonts and shapes stay; `CarColor.createCustom` tints icons and primary actions. |
| Turn icons and lane arrows | Us, as bitmaps | Glyph-style chevrons in phosphor. |
| Overlays on the surface (speed limit, scale bar, status line) | Us | Share Tech Mono, chamfered panels, kept inside the stable area. |
| Day and night mode | Host requests both | Night = Nostromo green; day palette must be added to the guide. |
| Phone app | Us | Full guide. |

In the car, the boot sequence is skipped and flicker/blink effects are off to avoid driver distraction.

## Prototype scope

1. **Browser simulator** (`/simulator`): car head-unit screen and phone side by side, real OpenStreetMap road data, real shortest-path routing, Phosphor HUD styling.
2. **Android Studio project** (`/android`): Kotlin, Car App Library, navigation category, with `CarAppService`, search, route preview and navigation screens, a surface renderer, `NavigationManager` updates and a simulated drive. Runs on the Desktop Head Unit.
3. **Docs** (`/docs`): this plan and a copy of the Phosphor HUD guide.

Out of scope: live traffic, voice, offline, accounts, Play release.

## Roadmap, risks and release

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Play car app review rejects the app | No Android Auto release | Follow NF-1 to NF-9 from day one; test on the Desktop Head Unit. |
| Host cards can't take the retro look | Car looks half-styled | Identity on the map surface; tint host elements. |
| Dark-only style vs daytime glare | Hard to read in sun | Add a day palette. |
| Provider costs grow | Running costs | Providers behind one interface. |
| POI/review parity with Google | Thinner place info | Partner data; driving features first. |

**Testing:** unit tests for routing and guidance, Desktop Head Unit runs, `AUTO_DRIVE` simulation, real-car drives. **Release:** internal track, closed beta, production.
