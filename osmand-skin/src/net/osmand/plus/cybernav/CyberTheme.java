package net.osmand.plus.cybernav;

import android.content.Context;
import android.content.SharedPreferences;

import net.osmand.plus.OsmandApplication;
import net.osmand.plus.activities.MapActivity;
import net.osmand.plus.plugins.PluginsHelper;
import net.osmand.plus.plugins.srtm.SRTMPlugin;
import net.osmand.plus.settings.backend.ApplicationMode;
import net.osmand.plus.settings.backend.OsmandSettings;
import net.osmand.plus.settings.backend.preferences.CommonPreference;

/**
 * The four phosphor themes of docs/concepts/CYBERNAV-HANDOFF.md: Green, Amber, Ice and White. One
 * theme colours the whole display: the driving HUD and CRT brackets, the vehicle under your position
 * (its edge material is "profile_color", so it takes the profile colour), the 3D building edges (the
 * custom 3D buildings colour) and the map's road lines (the style's hidden "cybernavTheme" property,
 * see recolor.py). The route stays yellow and alerts stay red in every theme.
 */
public final class CyberTheme {
	static final String[] IDS = {"green", "amber", "ice", "white"};
	static final String[] NAMES = {"GREEN", "AMBER", "ICE", "WHITE"};
	/** HUD ink, main roads, building edges and vehicle. */
	private static final int[] INK = {0xFFB8FF7A, 0xFFFFB000, 0xFF9FE8FF, 0xFFE6EEF5};
	/** The same ink at ~55% over black: side streets, dim HUD text. Must match recolor.py THEMES. */
	private static final int[] DIM = {0xFF668E44, 0xFF8D6100, 0xFF58808D, 0xFF7F8488};
	private static final String PREFS = "cybernav";
	private static final String KEY = "theme";
	private static final String RENDER_ATTR = "cybernavTheme";

	private static int current = -1;

	private CyberTheme() {
	}

	static int index(Context context) {
		if (current < 0) {
			SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
			current = Math.max(0, java.util.Arrays.asList(IDS).indexOf(p.getString(KEY, IDS[0])));
		}
		return current;
	}

	static int ink(Context context) {
		return INK[index(context)];
	}

	static int dim(Context context) {
		return DIM[index(context)];
	}

	static String name(Context context) {
		return NAMES[index(context)];
	}

	/** Switches to the next theme and recolours the map. */
	static void next(MapActivity activity) {
		current = (index(activity) + 1) % IDS.length;
		activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, IDS[current]).apply();
		apply(activity);
	}

	/**
	 * Makes the map settings match the theme (from MapActivity.onResume and after a switch). Only
	 * changed values are written, and the map is redrawn only if something changed.
	 */
	static void apply(MapActivity activity) {
		OsmandApplication app = (OsmandApplication) activity.getApplication();
		OsmandSettings s = app.getSettings();
		int i = index(activity);
		boolean changed = false;

		CommonPreference<String> road = s.getCustomRenderProperty(RENDER_ATTR);
		if (!IDS[i].equals(road.get())) {
			road.set(IDS[i]);
			changed = true;
		}
		int rgb = INK[i] & 0xFFFFFF;
		SRTMPlugin srtm = PluginsHelper.getPlugin(SRTMPlugin.class);
		for (boolean night : new boolean[] {true, false}) {
			CommonPreference<Integer> pref = night ? s.BUILDINGS_3D_CUSTOM_NIGHT_COLOR : s.BUILDINGS_3D_CUSTOM_DAY_COLOR;
			if (pref.get() != rgb) {
				if (srtm != null) {
					srtm.apply3DBuildingsCustomColor(night, rgb); // also updates the map engine
				} else {
					pref.set(rgb);
				}
				changed = true;
			}
		}
		for (ApplicationMode mode : new ApplicationMode[] {ApplicationMode.CAR, s.getApplicationMode()}) {
			Integer was = mode.getCustomIconColor();
			if (was == null || was != INK[i]) {
				mode.setCustomIconColor(INK[i]);
				changed = true;
			}
		}
		if (changed) {
			activity.refreshMapComplete();
			activity.getMapLayers().updateLayers(activity);
		}
	}
}
