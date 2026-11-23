# cyberNAV known issues and risks

Found while reviewing the repo, workflows and releases on 23 Nov 2026 (v0.0.23 / v0.0.24). Ordered by how much they matter.

## 1. Releases are signed with a public key

**What:** CI builds the `Debug` variant, so the APK is signed with OsmAnd's debug keystore, which is public in the OsmAnd repo. The CI check pins that certificate (SHA-256 `3465867d…6d03c7`).
**Why it matters:** release rule 1 asks for one persistent release key stored as a repo secret. With a public key, anyone can build an APK that Android accepts as an update to cyberNAV.
**Fix:** create a private release keystore, store it as repo secrets, sign the release with it and change the CI check. Changing the key breaks seamless updates **once**: every phone must uninstall and reinstall (maps and settings are lost unless exported). Best done at a natural break, such as the switch-over to a rebuilt app ([REBUILD-PLAN.md](REBUILD-PLAN.md)). Needs Aurora's go-ahead.

## 2. Two merges close together share one release

**What:** the workflow uses `concurrency: cancel-in-progress` per branch. If a second PR merges while the first merge's ~25-minute build is running, the first build is cancelled. The second build publishes one release containing both changes, with only the second CHANGELOG entry as notes (the version number of the first entry is never published).
**Fix:** merge one PR at a time and wait for the release, or set `cancel-in-progress: false` for pushes to `cybernav-osmand`.

## 3. Engine download is unpinned

**What:** CI downloads `OsmAndCore_androidNativeRelease-5.4.aar` and `OsmAndCore_android-5.4.aar` from `builder.osmand.net` by version name, with no checksum. If OsmAnd republishes 5.4, or the server is down, the build changes or fails. `patch_core.py` catches shader changes, but not other engine changes.
**Fix:** record the SHA-256 of both AARs and check them in CI; mirror them as release assets of this repo.

## 4. The driving screen is phone-only

**What:** `CyberDrive` attaches to the phone's `MapActivity`. Android Auto shows OsmAnd's car templates (search, route preview, guidance cards drawn by the host) over the cyberNAV-styled map.
**Why:** Android Auto never runs an app's own UI outside the map surface; a HUD on the car's map surface would mean drawing it inside OsmAnd's `SurfaceRenderer`.

## 5. Branch layout is confusing

**What:** the repo's default branch `main` is the design-concept branch and is behind; the app lives on `cybernav-osmand`; PR #2 (`cybernav-osmand` → `main`) and PR #1 (prototype) have been open since 1 Nov. This docs PR brings `main`'s concept docs into `cybernav-osmand` so everything is in one place.
**Fix (Aurora's call):** merge `cybernav-osmand` into `main` and make `main` the release branch (the workflow already triggers on both), or make `cybernav-osmand` the default branch on GitHub. Stale branches `claude/project-thread-mz2ek0` and `claude/project-thread-xkg99i` are merged and can be deleted.

## 6. Debug build, arm64 only

The APK is `NightlyFreeOpenglArm64Debug`: debuggable, not minified (larger and slower than a release build), and runs only on 64-bit ARM phones. Fine for sideloading; not suitable for the Play Store.

## 7. Patch fragility

`apply.sh` makes about 40 regex edits to OsmAnd and `patch_core.py` edits shader text in a binary. Both fail loudly, but every OsmAnd upgrade needs patterns fixed. `CyberDrive` also calls OsmAnd internals directly (`RoutingHelper`, `TargetPointsHelper`, `MapActions`, `FragmentsHelper`), which can change between OsmAnd versions.

## 8. Licence limits

OsmAnd's artwork is CC-BY-NC-ND 4.0: cyberNAV builds can't be sold or used commercially. The code is GPLv3: anyone receiving the APK can ask for the source (the public repo satisfies this).

## 9. Things the app does not have (vs Google Maps)

No live traffic, no Street View or photos, no reviews or opening-hours-rich place pages, no transit timetables beyond what OSM holds, no lane guidance in the cyberNAV HUD (OsmAnd's stock UI has it), no online search beyond what OsmAnd offers offline. Search quality depends on OSM address coverage.

## 10. Smaller items

- `docs/TESTING.md` describes the earlier custom prototype, not the shipping app.
- `docs/PLAN.md` recommends Mapbox; superseded (kept for history).
- `VERSION` was stale at 0.0.2 and is now updated with each docs refresh only; the real version comes from the release tags.
- A compiled Python cache file was committed under `osmand-skin/__pycache__/`; removed in v0.0.24 and ignored.
- The old prerelease `cybernav-osmand-latest` could not be deleted from a Claude session; delete it by hand on GitHub if it is still listed.
- Chakra Petch (the style guide's heading face) is not bundled; all text is Share Tech Mono.
- No automated tests for the skin itself; testing is by building and installing the APK.
