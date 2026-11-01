#!/usr/bin/env bash
# Applies the cyberNAV Phosphor HUD skin to an OsmAnd checkout.
#   apply.sh <OsmAnd checkout> <OsmAnd-resources checkout> [patched OsmAndCore_androidNativeRelease.aar]
# Every change is a small, checked edit, so a newer OsmAnd that moved something fails loudly
# here instead of building an unskinned app.
set -euo pipefail
SKIN="$(cd "$(dirname "$0")" && pwd)"
APP="$1/OsmAnd"; RES="$2"; CORE_AAR="${3:-}"
APP_ID="net.faradaymicrosystems.cybernav"

edit() { # edit <file> <python-regex> <replacement>  (must match at least once)
  python3 - "$@" <<'PY'
import re, sys
path, pat, rep = sys.argv[1:4]
s = open(path, encoding="utf-8").read()
n = len(re.findall(pat, s))
if n == 0: sys.exit(f"apply.sh: pattern not found in {path}: {pat}")
open(path, "w", encoding="utf-8").write(re.sub(pat, rep, s))
print(f"  {path.split('/')[-1]}: {n} change(s)")
PY
}

echo "1. Map style: Phosphor HUD colours in OsmAnd's default style"
python3 "$SKIN/recolor.py" render "$RES/rendering_styles/default.render.xml"

echo "2. App name and id (installs next to the real OsmAnd)"
edit "$APP/build.gradle" 'applicationId "net\.osmand\.dev"' "applicationId \"$APP_ID\""
edit "$APP/build.gradle" 'resValue "string", "app_name", "OsmAnd Nightly"' 'resValue "string", "app_name", "cyberNAV"'
edit "$APP/AndroidManifest-nightlyFree.xml" 'android:authorities="net\.osmand\.dev\.fileprovider"' "android:authorities=\"$APP_ID.fileprovider\""

echo "3. Defaults: map follows sunrise/sunset (night HUD after dark, light mode by day), dark app theme, 3D buildings on"
S="$APP/src/net/osmand/plus/settings/backend/OsmandSettings.java"
edit "$S" '"daynight_mode", DayNightMode\.DAY,' '"daynight_mode", DayNightMode.AUTO,'
edit "$S" '"osmand_theme", isSupportSystemTheme\(\) \? SYSTEM_DEFAULT_THEME : OSMAND_LIGHT_THEME\)' '"osmand_theme", OSMAND_DARK_THEME)'
edit "$S" '"enable_3d_map_objects", false\)' '"enable_3d_map_objects", true)'
edit "$S" 'BUILDINGS_3D_DEFAULT_COLOR = 0x666666;' 'BUILDINGS_3D_DEFAULT_COLOR = 0x2F6B1F;'
edit "$S" 'BUILDINGS_3D_ALPHA_DEF_VALUE = 0\.5f;' 'BUILDINGS_3D_ALPHA_DEF_VALUE = 1.0f;'

echo "3a. Map faces the direction of travel (not compass), tilted in 3D perspective"
edit "$S" '"rotate_map", ROTATE_MAP_MANUAL\)' '"rotate_map", ROTATE_MAP_BEARING)'
edit "$S" '"last_known_map_elevation", 90\)' '"last_known_map_elevation", 40)'
edit "$S" '"last_known_aa_map_elevation", 90\)' '"last_known_aa_map_elevation", 40)'
# A saved flat view (90) is never restored: the map always opens in 3D perspective
edit "$S" 'return Float\.isNaN\(elevation\) \? preference\.getProfileDefaultValue\(appMode\) : elevation;' 'return Float.isNaN(elevation) || elevation >= 90 ? preference.getProfileDefaultValue(appMode) : elevation; // cyberNAV: always open in 3D'
# 3D buildings drawn to the far (maximum) view distance
edit "$S" '"3d_buildings_view_distance", 1\)' '"3d_buildings_view_distance", 2)'
# 3D buildings at the detailed level (building parts), not plain blocks
edit "$S" '(private CommonPreference<Boolean> registerCustomRenderBooleanProperty\(@NonNull String attrName, boolean defaultValue\) \{)' '\1\n\t\tif ("show3DbuildingParts".equals(attrName)) defaultValue = true; // cyberNAV: detailed 3D buildings'
# Upgrades: move settings saved by older versions to the new defaults, once
edit "$APP/src/net/osmand/plus/activities/MapActivity.java" '(\n\t\tsuper\.onCreate\(savedInstanceState\);)' '\1\n\t\tnet.osmand.plus.cybernav.CyberMigrate.run(app);'

echo "4. App theme colours (dark theme only)"
python3 "$SKIN/recolor.py" colors "$APP/res/values/colors.xml"

echo "5. Wireframe navigation icon"
cp "$SKIN"/res/drawable/*.xml "$APP/res/drawable/"
cp "$SKIN/res/mipmap-anydpi-v26/icon_nightly.xml" "$APP/res/mipmap-anydpi-v26/icon_nightly.xml"

echo "6. In-app updates from GitHub releases"
mkdir -p "$APP/src/net/osmand/plus/cybernav"
cp "$SKIN"/src/net/osmand/plus/cybernav/*.java "$APP/src/net/osmand/plus/cybernav/"
edit "$APP/AndroidManifest.xml" '(\n(\s*)<uses-permission android:name="android\.permission\.INTERNET" />)' '\1\n\2<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
edit "$APP/src/net/osmand/plus/activities/MapActivity.java" '(protected void onResume\(\) \{\n\t\tsuper\.onResume\(\);)' '\1\n\t\tnet.osmand.plus.cybernav.CyberUpdater.check(this);\n\t\tnet.osmand.plus.cybernav.CyberMigrate.addDayNightButton(app);'

echo "7. First run: offer the whole country, not just the region"
edit "$APP/src/net/osmand/plus/firstusage/FirstUsageWizardFragment.java" '(\t\t\tif \(mapIndexItem != null\) \{\n)\t\t\t\tshowMapFoundWizard\(true\);(\n\t\t\t\} else \{\n\t\t\t\tcloseWizard\(\);)' '\1\t\t\t\tif (!net.osmand.plus.cybernav.CyberCountry.offer(getActivity(), downloadThread, validationManager, mapDownloadRegion, mapIndexItem,\n\t\t\t\t\t\t() -> showMapFoundWizard(true), () -> { mapDownloadCancelled = true; closeWizard(); })) {\n\t\t\t\t\tshowMapFoundWizard(true);\n\t\t\t\t}\2'

echo "8. Wireframe 3D buildings: use the map engine with patched building shaders"
if [ -n "$CORE_AAR" ]; then
  CORE_AAR="$(realpath "$CORE_AAR")"
  edit "$APP/build.gradle" 'dependencies\.add\("openglImplementation", "net\.osmand:OsmAndCore_androidNativeRelease:\$\{remoteAarSnapshot\}@aar"\)' "dependencies.add(\"openglImplementation\", files(\"$CORE_AAR\"))"
else
  echo "  skipped (no patched engine given): buildings stay solid"
fi

echo "9. Routing: a new stop is appended as the new final destination, never inserted mid-route"
T="$APP/src/net/osmand/plus/helpers/TargetPointsHelper.java"
edit "$T" '(\n(\t+))(if \(intermediate < 0 \|\| intermediate > intermediatePoints\.size\(\)\) \{)' '\1// cyberNAV: new stops always go at the end of the run (old destination becomes the last stop)\1if (intermediate >= 0 && intermediate <= intermediatePoints.size() && getPointToNavigate() != null) intermediate = intermediatePoints.size() + 1;\1\3'

echo "Skin applied."
