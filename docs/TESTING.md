# Trying the cyberNAV prototype

Three ways in, quickest first.

## 1. Browser (no install)

Open the browser simulator at https://claude.ai/artifact/Qc8a6WCD53WZuQCFXgx1rf (demo city only; live OpenStreetMap search needs the APK or a local run), or run it locally:

```
cd simulator && python3 -m http.server 8765
# open http://localhost:8765
```

You get the phone and an Android Auto head unit side by side, sharing one navigation session in the bundled demo city (Gothenburg, Sweden).

- Search a street (try `Linnégatan`) or tap the map and press **ROUTE HERE**.
- Pick one of up to 3 routes, press **START**. The demo car drives itself (×1, ×4, ×10).
- Press **WRONG TURN**, **GPS DROP** or **GPS JUMP** to see rerouting and GPS handling.
- On the head unit, **Search** and **Demo drive** work too. The grey rounded UI is a mock of what Android Auto draws; the green map is ours.
- `?mode=phone` shows only the phone app; `?mode=car` only the car map surface.

## 2. Android phone (APK)

1. On the phone, open **https://github.com/FaradayMicrosystems/cyberNAV/releases/tag/prototype-latest** and download `cyberNAV-prototype.apk`.
2. Open it. Android asks to allow installs from your browser: allow, then install.
3. Open **cyberNAV** and allow location.

The app starts in **LIVE** mode: it downloads roads and 3D buildings for about 6 km around you from OpenStreetMap (needs internet; usually 5 to 20 seconds). Search uses OpenStreetMap's Nominatim for addresses and places, plus street names offline.

Settings (≡, top right) switches to **Demo city** for the self-driving demo, changes phosphor colour, toggles 3D buildings and avoid-motorways.

Each new build installs over the previous one (same signing key), so just download again to update.

## 3. Android Auto

Android Auto only shows sideloaded apps once developer mode is on:

1. Phone **Settings → Apps → Android Auto → Additional settings in the app** (or open Android Auto from the launcher).
2. Scroll to **Version** and tap it about 10 times, accept the developer prompt.
3. ⋮ menu → **Developer settings** → enable **Unknown sources**.
4. Connect to the car (or the Desktop Head Unit, below). **cyberNAV** appears in the app launcher.

In the car: **Search** opens the car keyboard, results route straight to a 3-route preview, **Start** begins guidance. **Demo drive** runs a simulated trip in Gothenburg. The instrument cluster gets turn and ETA data through Android Auto's trip API.

### Desktop Head Unit (car screen on your computer)

1. Install Android Studio, then **SDK Manager → SDK Tools → Android Auto Desktop Head Unit Emulator**.
2. Phone: Android Auto developer settings → **Start head unit server**. Connect the phone by USB with USB debugging on.
3. Computer: `adb forward tcp:5277 tcp:5277`, then run `desktop-head-unit` from `<sdk>/extras/google/auto/`.

## What is real and what is not

| Works | Not in the prototype |
| --- | --- |
| Routing on real OSM roads, one-ways, 3 alternatives, avoid motorways; trips beyond the loaded 6 km fetch a road corridor | Live traffic (needs Mapbox or another paid feed) |
| Turn-by-turn, roundabout exits, voice prompts, rerouting | Lane guidance (data not loaded) |
| GPS dropouts, jumps, noise, stationary jitter handled | Offline maps for live mode |
| 3D wireframe buildings from OSM (placeholder blocks when offline) | Place details, reviews, photos |
| Android Auto: search, route preview, guidance, cluster data, "navigate to" intents | Play Store signing and review |

Known risks only a real device can confirm: the car map is drawn by a WebView on a virtual display, which is fast on the emulator but untested on slow head units; and public OpenStreetMap servers can be slow or rate-limited at busy times. If live mode fails, the log at the bottom says so; switch to **Demo city**.

## Automated tests

```
node --test simulator/test/core.test.mjs   # 31 navigation tests, ~15 s
node --test simulator/test/e2e.test.mjs    # 7 browser tests (needs: npm i -D playwright && npx playwright install chromium)
```

The core suite covers routing validity on 150 random trips, one-way rules, alternatives, avoid motorways, U-turn avoidance, maneuver generation, search (accents, typos, coordinates), simulated drives with GPS noise, wrong turns, tunnels (dropouts), GPS jumps, poor-accuracy fixes, stationary jitter, voice prompt timing, ETA behaviour, a 40-trip fuzz drive, and Android Auto template limits. GitHub Actions runs the tests on every push and builds the APK.
