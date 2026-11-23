# cyberNAV handover

Everything someone (person or Claude) needs to pick up cyberNAV cold. Written 23 Nov 2026 for v0.0.24. Detail lives in the linked docs; this page is the summary.

## What it is

cyberNAV is a retrofuturistic navigation app for Android phones and Android Auto, owned by Aurora (GitHub `FaradayMicrosystems`). It is **OsmAnd r5.4 (GPLv3) with a Phosphor HUD skin**: OsmAnd does maps, routing, voice, search and Android Auto; cyberNAV supplies the look, a custom driving screen and a few behaviour changes. Always spelled **cyberNAV**.

- Repo: https://github.com/FaradayMicrosystems/cyberNAV (public)
- **App branch: `cybernav-osmand`** (not `main`)
- Releases: https://github.com/FaradayMicrosystems/cyberNAV/releases
- App id `net.faradaymicrosystems.cybernav`, arm64 APK

## Current state

| | |
| --- | --- |
| Latest feature release | **v0.0.23** (16 Nov 2026): night-mode legibility of the driving screen |
| This release | **v0.0.24** (23 Nov 2026): documentation set, handover, rebuild plan; no app changes |
| Releases so far | v0.0.6 (first OsmAnd build, 1 Nov) to v0.0.24; history in `CHANGELOG.md` |
| Open PRs | #1 (old prototype → `main`), #2 (`cybernav-osmand` → `main`); both parked since 1 Nov |
| Work in flight | None. Own-UI plan **paused** by Aurora (16 Nov) until they say go. Rebuild plan written, **awaiting Aurora's decision**. |

What the app does today: black, minimal phosphor night map (green roads, yellow route, no labels), wireframe 3D buildings in the road green, 45° chase cam turning with travel direction, ten yellow-and-black 3D vehicles, Green/Amber/Ice/White themes, the Unit 01 driving screen (search bar, ETA next/end, ADD STOP/ADD ENDPOINT, speed limit, minimap, arriving and reroute alerts), natural TTS voice, smooth motion, 60 fps Android Auto, first-run whole-country download, in-app updater. See [USER-GUIDE.md](USER-GUIDE.md).

## How it is built (one minute version)

CI (`.github/workflows/osmand.yml`) checks out OsmAnd at pinned commits (`osmand-skin/versions.env`), downloads and shader-patches OsmAnd's native engine (`core/patch_core.py`), applies the skin (`osmand-skin/apply.sh`: recolour scripts, vehicle generator, ~40 checked regex edits, copies `net.osmand.plus.cybernav.*` classes), builds `assembleNightlyFreeOpenglArm64Debug`, checks signature / version / map style, and on pushes to `cybernav-osmand` publishes `cyberNAV v0.0.N`. Full detail: [ARCHITECTURE.md](ARCHITECTURE.md).

Key files: `osmand-skin/apply.sh` (read it first), `CyberDrive.java` (driving screen, ~1,100 lines), `CyberTheme.java`, `CyberHud.java`, `CyberUpdater.java`, `CyberMigrate.java`, `CyberVoice.java`, `CyberCountry.java`, `recolor.py`, `core/patch_core.py`, `vehicles/make_vehicles.py`.

## How to ship a change

1. Branch from `cybernav-osmand`; change only `osmand-skin/` (OsmAnd edits only through checked `apply.sh` steps).
2. Add `## v0.0.N+1 (date)` to the top of `CHANGELOG.md` (N = latest release). Plain, user-facing words.
3. PR into `cybernav-osmand`; CI builds (~25 min) and attaches the APK as an artifact.
4. CI green → **merge it yourself** (Aurora's standing rule). Merge one PR at a time.
5. The merge publishes the release; phones offer the update. **Tell Aurora when the build is done** (they asked to be notified).

Full detail and local build steps: [BUILD-AND-RELEASE.md](BUILD-AND-RELEASE.md).

## Aurora's standing rules

- Every change is its own release (+1), with a CHANGELOG entry that becomes the release notes.
- Releases install over the previous one; in-app updater from GitHub Releases.
- Name: cyberNAV. OsmAnd credited only in the README body.
- Anything "retrofuture" or "80s" uses the Phosphor HUD style guide.
- Merge your own PRs once CI passes; notify when builds are done.
- Paid OsmAnd extras (e.g. weather) only as independent implementations with free data.

## Design in one breath

One phosphor colour on black, wireframe with hidden lines, uppercase telemetry, scanlines. Roads and building edges #B8FF7A, side streets #668E44, route and vehicles #FFDF3D (vehicles with black lines), alerts #FF5A44. Sources: [DESIGN.md](DESIGN.md), the handoff in [`concepts/`](concepts/CYBERNAV-HANDOFF.md), the Phosphor HUD guide (https://claude.ai/artifact/3L6JbU7PhNtWVkihiVy6hq) and the Unit 01 reference (https://claude.ai/artifact/LpwHz2VUJwZj6UuaKc9GHz). Why things are the way they are: [DECISIONS.md](DECISIONS.md).

## Open items

| Item | Owner | Where |
| --- | --- | --- |
| Decide: full rebuild without OsmAnd, or custom UI on OsmAnd first | Aurora | [REBUILD-PLAN.md](REBUILD-PLAN.md) |
| Resume or keep paused the own-UI plan | Aurora | [ROADMAP.md](ROADMAP.md) |
| Releases are signed with OsmAnd's public debug key (breaks release rule 1's intent); fixing it needs one reinstall | Aurora to approve | [KNOWN-ISSUES.md §1](KNOWN-ISSUES.md#1-releases-are-signed-with-a-public-key) |
| CI merge race can fold two changes into one release | Any | [KNOWN-ISSUES.md §2](KNOWN-ISSUES.md#2-two-merges-close-together-share-one-release) |
| Engine AARs downloaded without checksum | Any | [KNOWN-ISSUES.md §3](KNOWN-ISSUES.md#3-engine-download-is-unpinned) |
| Branch layout: `main` is behind; PRs #1, #2 parked | Aurora | [KNOWN-ISSUES.md §5](KNOWN-ISSUES.md#5-branch-layout-is-confusing) |

## Things that bit us before

- OsmAnd's 3D engine reads the map style from **its own AAR bundle**, not the app's copy (v0.0.10). `apply.sh` step 8 repacks it; CI checks it.
- A destination from the HUD search does nothing unless **route planning mode** is entered first (v0.0.20).
- The driving screen redraws every 0.5 s; tap handling must survive redraws (v0.0.18).
- OsmAnd's night 3D sky and fog were hard-coded navy (v0.0.14).
- New defaults don't reach upgraded phones unless `CyberMigrate` applies them once.
- The theme colours exist in two places (`CyberTheme.java`, `recolor.py`) and must match.
- Bump `VERSION` in `make_vehicles.py` when vehicle models change, or phones keep the old ones.

## Fallback

The earlier custom prototype (own JS navigation core, WebView app, Android Auto) is in `simulator/` and `android/`, release `prototype-latest`, how-to in [TESTING.md](TESTING.md).

## Documentation map

[docs/README.md](README.md) lists every document.
