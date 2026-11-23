# Building and releasing cyberNAV

## The four release rules (project instructions)

| Rule | How cyberNAV meets it today | Gap |
| --- | --- | --- |
| 1. Seamless updates: same app id, one persistent signing key, version code always up | App id `net.faradaymicrosystems.cybernav` set by `apply.sh` step 2. CI fails the build unless the APK is signed with the expected certificate (SHA-256 `3465867d…6d03c7`) and has `versionCode = N`. | The key is **OsmAnd's public debug keystore** (`android/keystores/debug.keystore` in the OsmAnd repo), not a private key stored as a repo secret. Anyone can sign an APK that installs over cyberNAV. See [KNOWN-ISSUES.md](KNOWN-ISSUES.md#1-releases-are-signed-with-a-public-key). |
| 2. Automated versioning: one release per change, last number +1, name = app name + version | CI reads all `v0.0.N` release tags, takes the highest, adds 1. Tag `v0.0.N`, title `cyberNAV v0.0.N`, APK `cyberNAV-v0.0.N.apk`, `versionCode = N`. | Two merges within ~25 minutes: the second cancels the first build (`cancel-in-progress`), so the two changes share one release. Merge one PR at a time. |
| 3. Changelog entry per change, same text in release notes | CI copies the `## v0.0.N (date)` section of `CHANGELOG.md` into the notes; if missing, it lists commit subjects. | The entry's number must match the number CI will pick (highest tag + 1). Check the latest release before writing it. |
| 4. In-app updater | `CyberUpdater` reads `releases/latest`, compares `build=N` in the notes with the installed versionCode. CI appends `build=N` to every release's notes. | None. |

## Branches

| Branch | Role |
| --- | --- |
| `cybernav-osmand` | **The app's working branch.** Every push here that touches `osmand-skin/**`, `CHANGELOG.md` or the workflow builds and publishes a release. PRs target this branch. |
| `main` | The repo's default branch, but behind: it holds the original plan, style guide and design concepts only. PR #2 (`cybernav-osmand` → `main`) has been open since 1 Nov. |
| `prototype/android-auto-sim` | Earlier custom prototype, PR #1, release `prototype-latest`. |
| `claude/project-thread-*` | Per-thread working branches. Merged ones can be deleted. |

## How to ship a change (the routine)

1. Branch from `cybernav-osmand`.
2. Make the change. If it touches OsmAnd behaviour, add a checked `edit` step to `apply.sh` (never edit OsmAnd files any other way) and put new Java in `osmand-skin/src/net/osmand/plus/cybernav/`.
3. If settings saved by older versions need changing, add a one-time step to `CyberMigrate.run` with a new key.
4. Look up the latest release (`v0.0.N`). Add a `## v0.0.N+1 (YYYY-MM-DD)` section at the top of `CHANGELOG.md`, in plain user-facing language.
5. Open a PR into `cybernav-osmand`. The **Build cyberNAV** workflow builds it (~20–25 min) without publishing; the APK is attached to the run as the `cyberNAV-apk` artifact for testing.
6. When CI passes, merge (Aurora's standing rule: Claude merges its own PRs once CI is green). The push to `cybernav-osmand` builds again and publishes `cyberNAV v0.0.N+1`, marked latest.
7. Phones with cyberNAV installed offer the update on the next launch (checks at most hourly).

## What CI checks (`.github/workflows/osmand.yml`)

- Every `apply.sh` edit matched (a moved OsmAnd line fails the build with the file and pattern).
- Every `patch_core.py` shader patch matched exactly once.
- APK signed with the expected certificate and has app id `net.faradaymicrosystems.cybernav` and the new versionCode.
- The engine's bundled map style is the cyberNAV style (`cybernav="phosphor-hud"` marker in `default.render.xml.qz`).

There are no unit tests for the skin. The local style-check harness used in earlier threads (compile OsmAnd-java's render package with stubs for `PlatformUtil`, `Algorithms`, `BinaryMapDataObject`, plus kxml2, trove4j and commons-logging) is not in the repo.

## Building locally

Needs JDK 17, the Android SDK and NDK, Python 3, about 15 GB of disk and 8 GB of RAM.

```bash
mkdir cybernav-build && cd cybernav-build
git clone https://github.com/FaradayMicrosystems/cyberNAV skin && git -C skin checkout cybernav-osmand
source <(grep -v '^#' skin/osmand-skin/versions.env | sed 's/^/export /')
for r in OsmAnd:android OsmAnd-resources:resources OsmAnd-core:core OsmAnd-core-legacy:core-legacy OsmAnd-build:build; do
  repo=${r%%:*}; dir=${r##*:}; var=$(echo "${repo}" | tr 'a-z-' 'A-Z_')_REF
  [ "$repo" = OsmAnd ] && var=OSMAND_REF
  git clone https://github.com/osmandapp/$repo $dir && git -C $dir checkout ${!var}
done
mkdir -p cybernav-core
curl -fsSL -o cybernav-core/original.aar https://builder.osmand.net/ivy/net.osmand/OsmAndCore_androidNativeRelease/5.4/OsmAndCore_androidNativeRelease-5.4.aar
python3 skin/osmand-skin/core/patch_core.py cybernav-core/original.aar cybernav-core/OsmAndCore_androidNativeRelease.aar
curl -fsSL -o cybernav-core/OsmAndCore_android.aar https://builder.osmand.net/ivy/net.osmand/OsmAndCore_android/5.4/OsmAndCore_android-5.4.aar
bash skin/osmand-skin/apply.sh android resources cybernav-core/OsmAndCore_androidNativeRelease.aar
cd android && APK_NUMBER_VERSION=999 APK_VERSION=0.0.999 ./gradlew assembleNightlyFreeOpenglArm64Debug
```

Without the engine AAR argument, `apply.sh` skips step 8 and buildings stay solid (stock OsmAnd shaders).

## Moving to a newer OsmAnd

1. Change the commits in `versions.env` (and the `5.4` engine AAR URLs in the workflow if the major version changes).
2. Open a PR. Each `apply.sh` / `patch_core.py` mismatch fails with a clear message; fix the pattern for the new code.
3. Test the APK artifact on a phone and in Android Auto before merging: wireframe buildings, black night map, driving screen, updater.

## The earlier prototype's pipeline

`.github/workflows/android.yml` runs the simulator's navigation and browser tests and builds the WebView prototype APK on pushes to `main` and `prototype/**` and on every PR. It publishes to `prototype-latest`. It has nothing to do with the shipping app.
