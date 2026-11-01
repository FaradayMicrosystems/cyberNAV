package net.osmand.plus.cybernav;

import android.content.Context;
import android.content.SharedPreferences;

import net.osmand.core.android.MapRendererContext;
import net.osmand.core.android.MapRendererView;
import net.osmand.plus.views.corenative.NativeCoreContext;
import net.osmand.plus.OsmandApplication;
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
}
