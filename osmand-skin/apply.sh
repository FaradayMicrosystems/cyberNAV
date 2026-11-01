#!/usr/bin/env bash
# Applies the cyberNAV Phosphor HUD skin to an OsmAnd checkout.
#   apply.sh <OsmAnd checkout> <OsmAnd-resources checkout>
# Every change is a small, checked edit, so a newer OsmAnd that moved something fails loudly
# here instead of building an unskinned app.
set -euo pipefail
SKIN="$(cd "$(dirname "$0")" && pwd)"
APP="$1/OsmAnd"; RES="$2"
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

echo "3. Defaults: night map, dark app theme, 3D buildings on, phosphor buildings"
S="$APP/src/net/osmand/plus/settings/backend/OsmandSettings.java"
edit "$S" '"daynight_mode", DayNightMode\.DAY,' '"daynight_mode", DayNightMode.NIGHT,'
edit "$S" '"osmand_theme", isSupportSystemTheme\(\) \? SYSTEM_DEFAULT_THEME : OSMAND_LIGHT_THEME\)' '"osmand_theme", OSMAND_DARK_THEME)'
edit "$S" '"enable_3d_map_objects", false\)' '"enable_3d_map_objects", true)'
edit "$S" 'BUILDINGS_3D_DEFAULT_COLOR = 0x666666;' 'BUILDINGS_3D_DEFAULT_COLOR = 0x2F6B1F;'
edit "$S" 'BUILDINGS_3D_ALPHA_DEF_VALUE = 0\.5f;' 'BUILDINGS_3D_ALPHA_DEF_VALUE = 0.35f;'

echo "3b. Night palette everywhere (phone map, app and Android Auto): the HUD is night-only"
D="$APP/src/net/osmand/plus/helpers/DayNightHelper.java"
edit "$D" '(@NonNull ThemeUsageContext usageContext, boolean checkCarSettings\) \{)' '\1\n\t\tif (true) return true; // cyberNAV: Phosphor HUD is night-only'
edit "$D" '(public boolean isNightModeForCar\(@NotNull CarContext carContext\) \{)' '\1\n\t\tif (true) return true; // cyberNAV: Phosphor HUD is night-only'

echo "4. App theme colours (dark theme only)"
python3 "$SKIN/recolor.py" colors "$APP/res/values/colors.xml"

echo "5. Wireframe navigation icon"
cp "$SKIN"/res/drawable/*.xml "$APP/res/drawable/"
cp "$SKIN/res/mipmap-anydpi-v26/icon_nightly.xml" "$APP/res/mipmap-anydpi-v26/icon_nightly.xml"

echo "6. In-app updates from GitHub releases"
mkdir -p "$APP/src/net/osmand/plus/cybernav"
cp "$SKIN"/src/net/osmand/plus/cybernav/*.java "$APP/src/net/osmand/plus/cybernav/"
edit "$APP/AndroidManifest.xml" '(\n(\s*)<uses-permission android:name="android\.permission\.INTERNET" />)' '\1\n\2<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
edit "$APP/src/net/osmand/plus/activities/MapActivity.java" '(protected void onResume\(\) \{\n\t\tsuper\.onResume\(\);)' '\1\n\t\tnet.osmand.plus.cybernav.CyberUpdater.check(this);'

echo "7. First run: offer the whole country, not just the region"
edit "$APP/src/net/osmand/plus/firstusage/FirstUsageWizardFragment.java" '(\t\t\tif \(mapIndexItem != null\) \{\n)\t\t\t\tshowMapFoundWizard\(true\);(\n\t\t\t\} else \{\n\t\t\t\tcloseWizard\(\);)' '\1\t\t\t\tif (!net.osmand.plus.cybernav.CyberCountry.offer(getActivity(), downloadThread, validationManager, mapDownloadRegion, mapIndexItem,\n\t\t\t\t\t\t() -> showMapFoundWizard(true), () -> { mapDownloadCancelled = true; closeWizard(); })) {\n\t\t\t\t\tshowMapFoundWizard(true);\n\t\t\t\t}\2'

echo "Skin applied."
