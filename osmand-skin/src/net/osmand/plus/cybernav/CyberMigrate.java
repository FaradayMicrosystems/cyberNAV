package net.osmand.plus.cybernav;

import android.content.Context;
import android.content.SharedPreferences;

import net.osmand.core.android.MapRendererContext;
import net.osmand.core.android.MapRendererView;
import net.osmand.plus.views.corenative.NativeCoreContext;
import net.osmand.plus.OsmandApplication;
import net.osmand.plus.quickaction.MapButtonsHelper;
import net.osmand.plus.quickaction.actions.DayNightModeAction;
import net.osmand.plus.views.mapwidgets.configure.buttons.QuickActionButtonState;
import net.osmand.plus.settings.backend.ApplicationMode;
import net.osmand.plus.settings.backend.OsmandSettings;

/**
 * One-time fixes for settings saved by an older cyberNAV, so new defaults also reach upgrades.
 * Each step runs once per install (tracked in the "cybernav_migrate" prefs).
 */
public final class CyberMigrate {
	private static final int FAR_BUILDINGS = 2; // OsmAnd's 3D buildings view distance: 1 = near, 2 = far (max)
	private static final float TILT = 40f;      // elevation angle; 90 = flat

	private CyberMigrate() {
	}

	public static void run(OsmandApplication app) {
		SharedPreferences p = app.getSharedPreferences("cybernav_migrate", Context.MODE_PRIVATE);
		if (p.getBoolean("v8_buildings_tilt", false)) {
			return;
		}
		OsmandSettings settings = app.getSettings();
		for (ApplicationMode mode : ApplicationMode.allPossibleValues()) {
			settings.BUILDINGS_3D_VIEW_DISTANCE.setModeValue(mode, FAR_BUILDINGS);
			settings.setLastKnownMapElevation(mode, TILT);
			settings.getCustomRenderBooleanProperty("show3DbuildingParts").setModeValue(mode, true); // detailed buildings
		}
		MapRendererContext ctx = NativeCoreContext.getMapRendererContext();
		MapRendererView view = ctx != null ? ctx.getMapRendererView() : null;
		if (view != null) {
			view.set3DBuildingsDetalization(FAR_BUILDINGS);
		}
		p.edit().putBoolean("v8_buildings_tilt", true).apply();
	}

	/**
	 * Adds a DAY / NIGHT button to the map HUD once: one tap flips between the light (day) map and
	 * the night HUD map. It is an ordinary OsmAnd custom map button, so it can be moved or removed
	 * under Configure screen. Runs from MapActivity.onResume, once the map buttons are set up.
	 */
	public static void addDayNightButton(OsmandApplication app) {
		SharedPreferences p = app.getSharedPreferences("cybernav_migrate", Context.MODE_PRIVATE);
		if (p.getBoolean("v9_daynight_button", false)) {
			return;
		}
		try {
			MapButtonsHelper helper = app.getMapButtonsHelper();
			QuickActionButtonState button = helper.createNewButtonState();
			button.setName("DAY / NIGHT");
			for (ApplicationMode mode : ApplicationMode.allPossibleValues()) {
				button.getVisibilityPref().setModeValue(mode, true);
			}
			helper.addQuickAction(button, new DayNightModeAction());
			helper.addQuickActionButtonState(button);
			p.edit().putBoolean("v9_daynight_button", true).apply();
		} catch (RuntimeException e) {
			// Map buttons not ready yet: try again on the next resume.
		}
	}
}
