package net.osmand.plus.cybernav;

import android.app.AlertDialog;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.fragment.app.FragmentActivity;

import net.osmand.map.WorldRegion;
import net.osmand.plus.download.DownloadActivityType;
import net.osmand.plus.download.DownloadIndexesThread;
import net.osmand.plus.download.DownloadValidationManager;
import net.osmand.plus.download.IndexItem;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * cyberNAV first-run choice: when OsmAnd's start wizard finds the map for the user's region and
 * that region is part of a country split into several maps, offer to download the whole
 * country instead. Part of the cyberNAV skin (GPLv3), not OsmAnd.
 */
public final class CyberCountry {
	private static final Set<String> CONTINENTS = new HashSet<>(Arrays.asList(
			WorldRegion.AFRICA_REGION_ID, WorldRegion.ASIA_REGION_ID, WorldRegion.AUSTRALIA_AND_OCEANIA_REGION_ID,
			WorldRegion.CENTRAL_AMERICA_REGION_ID, WorldRegion.EUROPE_REGION_ID, WorldRegion.NORTH_AMERICA_REGION_ID,
			WorldRegion.SOUTH_AMERICA_REGION_ID, WorldRegion.ANTARCTICA_REGION_ID));

	private CyberCountry() {
	}

	/**
	 * Shows the region / whole-country choice. Returns false (and shows nothing) when the region
	 * is the whole country already; then the wizard carries on as usual.
	 *
	 * @param regionOnly    runs when the user keeps OsmAnd's single-region download
	 * @param countryQueued runs after the whole country was queued (closes the wizard)
	 */
	public static boolean offer(FragmentActivity activity, DownloadIndexesThread thread, DownloadValidationManager validation,
	                            WorldRegion region, IndexItem regionItem, Runnable regionOnly, Runnable countryQueued) {
		if (activity == null || region == null || regionItem == null) return false;
		WorldRegion country = countryOf(region);
		if (country == null || country == region) return false;
		List<IndexItem> items = new ArrayList<>();
		collect(thread, country, items);
		if (items.size() <= 1) return false;
		long bytes = 0;
		for (IndexItem i : items) bytes += i.getSize();

		float d = activity.getResources().getDisplayMetrics().density;
		LinearLayout box = CyberUpdater.panel(activity);
		box.addView(CyberUpdater.text(activity, "CHART DOWNLOAD // " + country.getLocaleName().toUpperCase(Locale.ROOT), 15, CyberUpdater.PHOSPHOR, true));
		TextView body = CyberUpdater.text(activity, "YOU ARE IN " + region.getLocaleName().toUpperCase(Locale.ROOT)
				+ ". DOWNLOAD JUST THIS REGION, OR EVERY MAP FOR " + country.getLocaleName().toUpperCase(Locale.ROOT)
				+ " (" + items.size() + " MAPS, " + size(bytes) + "). USE WI-FI FOR THE WHOLE COUNTRY.", 12, CyberUpdater.DIM, false);
		body.setPadding(0, (int) (10 * d), 0, (int) (16 * d));
		box.addView(body);

		Button whole = CyberUpdater.button(activity, "WHOLE COUNTRY · " + size(bytes), true, d);
		Button just = CyberUpdater.button(activity, "JUST THIS REGION · " + size(regionItem.getSize()), false, d);
		for (Button b : new Button[] {whole, just}) {
			LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) b.getLayoutParams();
			lp.width = LinearLayout.LayoutParams.MATCH_PARENT;
			lp.leftMargin = 0;
			lp.topMargin = (int) (8 * d);
			box.addView(b);
		}
		AlertDialog dialog = CyberUpdater.show(activity, box);
		dialog.setCancelable(false);
		whole.setOnClickListener(v -> {
			dialog.dismiss();
			validation.startDownload(activity, items.toArray(new IndexItem[0]));
			thread.initSettingsFirstMap(region);
			Toast.makeText(activity, "cyberNAV // DOWNLOADING " + items.size() + " MAPS", Toast.LENGTH_LONG).show();
			countryQueued.run();
		});
		just.setOnClickListener(v -> {
			dialog.dismiss();
			regionOnly.run();
		});
		return true;
	}

	/** The country a region belongs to: the ancestor just below a continent (or the world). */
	static WorldRegion countryOf(WorldRegion region) {
		WorldRegion r = region;
		while (r.getSuperregion() != null) {
			WorldRegion up = r.getSuperregion();
			if (CONTINENTS.contains(up.getRegionId()) || up.getSuperregion() == null) return r;
			r = up;
		}
		return r;
	}

	private static void collect(DownloadIndexesThread thread, WorldRegion r, List<IndexItem> out) {
		if (r.isRegionMapDownload()) {
			for (IndexItem i : thread.getIndexes().getIndexItems(r)) {
				if (i.getType() == DownloadActivityType.NORMAL_FILE && !i.isDownloaded()) {
					out.add(i);
					break;
				}
			}
		}
		if (r.getSubregions() != null) for (WorldRegion sub : r.getSubregions()) collect(thread, sub, out);
	}

	private static String size(long bytes) {
		double mb = bytes / 1048576.0;
		return mb >= 1024 ? String.format(Locale.US, "%.1f GB", mb / 1024) : String.format(Locale.US, "%.0f MB", mb);
	}
}
