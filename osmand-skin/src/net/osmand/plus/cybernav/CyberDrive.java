package net.osmand.plus.cybernav;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.DashPathEffect;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;

import net.osmand.Location;
import net.osmand.binary.RouteDataObject;
import net.osmand.plus.OsmandApplication;
import net.osmand.plus.activities.MapActivity;
import net.osmand.plus.dashboard.DashboardType;
import net.osmand.plus.helpers.TargetPoint;
import net.osmand.plus.routing.NextDirectionInfo;
import net.osmand.plus.routing.RouteCalculationResult;
import net.osmand.plus.routing.RoutingHelper;
import net.osmand.plus.search.ShowQuickSearchMode;
import net.osmand.plus.settings.backend.OsmandSettings;
import net.osmand.plus.settings.enums.DayNightMode;
import net.osmand.plus.settings.enums.ThemeUsageContext;
import net.osmand.plus.utils.FormattedValue;
import net.osmand.plus.utils.OsmAndFormatter;
import net.osmand.router.TurnType;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * The cyberNAV driving screen, after the "Unit 01 · CyberNav · P1 green" concept screen. It replaces
 * OsmAnd's own buttons and widgets (the map_hud_container is hidden while it is on) with:
 * a sidebar (left in landscape, top in portrait) holding the cyberNAV header, a route search bar
 * (on a route: "next stop ETA / route ETA" plus ADD STOP and ADD ENDPOINT), the speed limit and
 * street, a heading-up route minimap and the MENU / CENTER / DAY-NIGHT / THEME / STOCK UI / STOP buttons;
 * and on the map: next manoeuvre (or an arriving / rerouting alert), heading tape, ETA-distance readout and a status line.
 * Touches outside the panels go through to the map. STOCK UI brings OsmAnd's own screen back.
 */
public final class CyberDrive {
	// HUD ink and its dim tone come from the phosphor theme (CyberTheme), refreshed every frame
	private static int PHOSPHOR = 0xFFB8FF7A;
	private static int DIM = 0xFF668E44;
	/** Small-text tone: the ink at ~80%, readable on the black night map (v0.0.23; DIM was too dark). */
	private static int LABEL = 0xFF93CC62;
	/** Panel fill: black with a faint ink tint, so panels stand out from the pure black night map. */
	private static int PANEL = 0xFF0C1408;
	private static final int ROUTE = 0xFFFFDF3D;
	private static final int ALERT = 0xFFFF5A44; // Phosphor HUD --signal-alert
	private static final String TAG = "cybernav_drive";
	private static final String PREFS = "cybernav";
	private static final String KEY_ON = "drive_hud";
	private static final int NONE = 0, NEXT = 1, END = 2;
	private static final long PENDING_MS = 5 * 60_000L;

	/** Must match the ids in vehicles/make_vehicles.py. */
	private static final String[] VEHICLE_IDS = {"meridian", "talon", "rancher", "courier", "strider",
			"shuttle", "prospector", "haulmaster", "lancet", "metro"};
	private static final String[] VEHICLE_NAMES = {"MERIDIAN · SEDAN", "TALON · REVERSE TRIKE", "RANCHER · PICKUP / UTE",
			"COURIER · VAN", "STRIDER · MOTORCYCLE", "SHUTTLE · SHUTTLECRAFT", "PROSPECTOR · SIX-WHEEL ROVER",
			"HAULMASTER · SEMI TRACTOR", "LANCET · SPORTS CAR", "METRO · BUS"};

	private static int pending = NONE;
	private static long pendingAt;
	private static long addedAt;

	private CyberDrive() {
	}

	/** Puts the driving screen over the map once (from MapActivity.onResume). */
	public static void attach(MapActivity activity) {
		View stock = activity.findViewById(net.osmand.plus.R.id.map_hud_container);
		if (stock == null || !(stock.getParent() instanceof ViewGroup)) {
			return;
		}
		ViewGroup parent = (ViewGroup) stock.getParent();
		if (parent.findViewWithTag(TAG) != null) {
			return;
		}
		try {
			CyberTheme.apply(activity);
		} catch (RuntimeException e) {
			android.util.Log.w("cyberNAV", "theme not applied", e);
		}
		DriveView view = new DriveView(activity, stock);
		view.setTag(TAG);
		parent.addView(view, parent.indexOfChild(stock) + 1,
				new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
	}

	/**
	 * Where TargetPointsHelper.navigateToPoint puts a new stop. ADD STOP puts it first (between you
	 * and your next destination); otherwise a new stop becomes the last one of the journey.
	 */
	public static int stopIndex(int intermediate, int stops, boolean hasTarget) {
		int mode = pending;
		boolean fresh = System.currentTimeMillis() - pendingAt < PENDING_MS;
		if (intermediate >= 0) {
			pending = NONE;
		}
		if (mode != NONE && fresh && intermediate >= 0) {
			addedAt = System.currentTimeMillis();
		}
		if (mode == NEXT && fresh && hasTarget && intermediate >= 0 && intermediate <= stops) {
			return 0;
		}
		if (intermediate >= 0 && intermediate <= stops && hasTarget) {
			return stops + 1;
		}
		return intermediate;
	}

	private static final class Hit {
		final RectF r;
		final Runnable run;

		Hit(RectF r, Runnable run) {
			this.r = r;
			this.run = run;
		}
	}

	private static final class DriveView extends View {
		private final MapActivity act;
		private final OsmandApplication app;
		private final View stock;
		private final SharedPreferences prefs;
		private final float dp;
		private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
		private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
		private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
		private final Path path = new Path();
		private final List<Hit> hits = new ArrayList<>();
		private final List<RectF> panels = new ArrayList<>();
		private Hit pressed;
		private float bearing;
		private boolean on;
		private RouteCalculationResult lastRoute;
		private List<Location> oldRoute;
		private long oldRouteUntil;
		private final Runnable tick = new Runnable() {
			@Override
			public void run() {
				sync();
				invalidate();
				postDelayed(this, 500);
			}
		};

		DriveView(MapActivity activity, View stock) {
			super(activity);
			this.act = activity;
			this.app = (OsmandApplication) activity.getApplication();
			this.stock = stock;
			this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
			dp = activity.getResources().getDisplayMetrics().density;
			Typeface font = CyberHud.font();
			text.setTypeface(font != null ? font : Typeface.MONOSPACE);
			text.setShadowLayer(4 * dp, 0, 0, Color.BLACK);
			line.setStyle(Paint.Style.STROKE);
			line.setStrokeCap(Paint.Cap.ROUND);
			line.setStrokeJoin(Paint.Join.ROUND);
			setWillNotDraw(false);
			sync();
		}

		@Override
		protected void onAttachedToWindow() {
			super.onAttachedToWindow();
			removeCallbacks(tick);
			post(tick);
		}

		@Override
		protected void onDetachedFromWindow() {
			removeCallbacks(tick);
			super.onDetachedFromWindow();
		}

		private void sync() {
			on = prefs.getBoolean(KEY_ON, true);
			int want = on ? INVISIBLE : VISIBLE;
			if (stock.getVisibility() != want) {
				stock.setVisibility(want);
			}
			// A stop added from the HUD: keep driving instead of opening the route planner
			if (System.currentTimeMillis() - addedAt < 4000 && app.getRoutingHelper().isFollowingMode()) {
				act.getMapRouteInfoMenu().hide();
			}
		}

		private void setOn(boolean value) {
			prefs.edit().putBoolean(KEY_ON, value).apply();
			sync();
			invalidate();
		}

		// ---------------------------------------------------------------- touch

		@Override
		public boolean onTouchEvent(MotionEvent e) {
			float x = e.getX(), y = e.getY();
			switch (e.getActionMasked()) {
				case MotionEvent.ACTION_DOWN:
					pressed = find(x, y);
					if (pressed == null && !inPanel(x, y)) {
						return false; // the map gets it
					}
					invalidate();
					return true;
				case MotionEvent.ACTION_UP:
					Hit h = find(x, y);
					Hit was = pressed;
					pressed = null;
					invalidate();
					// hits are rebuilt on every redraw: match the button by its rectangle, not the object
					if (h != null && was != null && h.r.equals(was.r)) {
						performClick();
						try {
							h.run.run();
						} catch (RuntimeException ex) {
							android.util.Log.w("cyberNAV", "HUD action failed", ex);
						}
					}
					return true;
				case MotionEvent.ACTION_CANCEL:
					pressed = null;
					invalidate();
					return true;
				default:
					return true;
			}
		}

		@Override
		public boolean performClick() {
			return super.performClick();
		}

		private Hit find(float x, float y) {
			for (Hit h : hits) {
				if (h.r.contains(x, y)) {
					return h;
				}
			}
			return null;
		}

		private boolean inPanel(float x, float y) {
			for (RectF r : panels) {
				if (r.contains(x, y)) {
					return true;
				}
			}
			return false;
		}

		// ---------------------------------------------------------------- actions

		private void search(int mode) {
			pending = mode;
			pendingAt = System.currentTimeMillis();
			RoutingHelper rh = app.getRoutingHelper();
			if (!rh.isFollowingMode() && !rh.isRoutePlanningMode()) {
				// What OsmAnd's own Navigation button does first. Without route planning mode a picked
				// destination is only stored: no route is calculated, the route card with Start never
				// opens and the voice prompts are not set up (the v0.0.17 to v0.0.19 navigation bug).
				act.getMapActions().enterRoutePlanningModeGivenGpx(null, null, null, true, false);
			}
			act.getFragmentsHelper().showQuickSearch(mode == NONE
					? ShowQuickSearchMode.DESTINATION_SELECTION : ShowQuickSearchMode.INTERMEDIATE_SELECTION, false);
		}

		/** The same as OsmAnd's own menu button: the dashboard, or the side drawer. */
		private void openMenu() {
			if (app.getSettings().SHOW_DASHBOARD_ON_MAP_SCREEN.get()) {
				act.getDashboard().setDashboardVisibility(true, DashboardType.DASHBOARD);
			} else {
				act.openDrawer();
			}
		}

		/** The CyberNav vehicles (3D models bundled by vehicles/make_vehicles.py) as the map marker. */
		private void pickVehicle() {
			String[] ids = VEHICLE_IDS;
			String[] labels = new String[ids.length];
			String current = app.getSettings().NAVIGATION_ICON.get();
			int checked = -1;
			for (int i = 0; i < ids.length; i++) {
				labels[i] = VEHICLE_NAMES[i];
				if (("model_cybernav_" + ids[i]).equals(current)) {
					checked = i;
				}
			}
			new android.app.AlertDialog.Builder(act)
					.setTitle("CHOOSE YOUR VEHICLE")
					.setSingleChoiceItems(labels, checked, (d, which) -> {
						String model = "model_cybernav_" + ids[which];
						app.getSettings().NAVIGATION_ICON.set(model);
						app.getSettings().LOCATION_ICON.set(model);
						d.dismiss();
					})
					.setNegativeButton(android.R.string.cancel, null)
					.show();
		}

		/** Back to your position, following it again (OsmAnd's my-location button). */
		private void recenter() {
			if (android.os.Build.VERSION.SDK_INT >= 23 && act.checkSelfPermission(
					android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
				act.requestPermissions(new String[] {android.Manifest.permission.ACCESS_FINE_LOCATION,
						android.Manifest.permission.ACCESS_COARSE_LOCATION}, 101); // OsmAndLocationProvider.REQUEST_LOCATION_PERMISSION
				return;
			}
			app.getMapViewTrackingUtilities().backToLocationImpl();
		}

		/** Round re-centre button on the map, bottom left: a ring with a crosshair, filled while following. */
		private void recenterRing(Canvas c, float l, float b) {
			float rad = 26 * dp, cx = l + rad + 4 * dp, cy = b - rad - 26 * dp;
			RectF r = new RectF(cx - rad, cy - rad, cx + rad, cy + rad);
			boolean linked = app.getMapViewTrackingUtilities().isMapLinkedToLocation();
			boolean down = pressed != null && pressed.r.equals(r);
			fill.setStyle(Paint.Style.FILL);
			fill.setColor(down ? PHOSPHOR : Color.argb(200, 0, 0, 0));
			c.drawCircle(cx, cy, rad, fill);
			int ink = down ? Color.BLACK : linked ? LABEL : PHOSPHOR;
			line.setColor(ink);
			line.setStrokeWidth(2 * dp);
			c.drawCircle(cx, cy, rad - 1 * dp, line);
			c.drawCircle(cx, cy, rad * 0.42f, line);
			for (int i = 0; i < 4; i++) {
				double a = Math.PI / 2 * i;
				float dx = (float) Math.cos(a), dy = (float) Math.sin(a);
				c.drawLine(cx + dx * rad * 0.42f, cy + dy * rad * 0.42f, cx + dx * rad * 0.78f, cy + dy * rad * 0.78f, line);
			}
			if (linked) {
				fill.setColor(ink);
				c.drawCircle(cx, cy, 3 * dp, fill);
			}
			panels.add(r);
			hits.add(new Hit(r, this::recenter));
		}

		private void nextTheme() {
			CyberTheme.next(act);
			CyberHud.refresh(act);
			invalidate();
		}

		private void toggleDayNight() {
			OsmandSettings s = app.getSettings();
			boolean night = app.getDaynightHelper().isNightMode(ThemeUsageContext.MAP);
			s.DAYNIGHT_MODE.set(night ? DayNightMode.DAY : DayNightMode.NIGHT);
		}

		// ---------------------------------------------------------------- drawing

		@Override
		protected void onDraw(Canvas c) {
			PHOSPHOR = CyberTheme.ink(act);
			DIM = CyberTheme.dim(act);
			LABEL = mix(PHOSPHOR, 0.8f);
			PANEL = mix(PHOSPHOR, 0.09f);
			hits.clear();
			panels.clear();
			int w = getWidth(), h = getHeight();
			float top = 0, bottom = 0, left = 0, right = 0;
			WindowInsets wi = getRootWindowInsets();
			if (wi != null) {
				top = wi.getSystemWindowInsetTop();
				bottom = wi.getSystemWindowInsetBottom();
				left = wi.getSystemWindowInsetLeft();
				right = wi.getSystemWindowInsetRight();
			}
			if (!on) {
				RectF chip = new RectF(w / 2f - 46 * dp, top + 8 * dp, w / 2f + 46 * dp, top + 40 * dp);
				button(c, chip, "◇ HUD", () -> setOn(true));
				return;
			}
			State s = new State();
			if (w > h) {
				drawLandscape(c, s, w, h, top, bottom, left, right);
			} else {
				drawPortrait(c, s, w, h, top, bottom, left, right);
			}
		}

		/** Everything the screen shows, read once per frame. */
		private final class State {
			final RoutingHelper rh = app.getRoutingHelper();
			final boolean following = rh.isFollowingMode();
			final TargetPoint target = app.getTargetPointsHelper().getPointToNavigate();
			final boolean routed = target != null && rh.isRouteCalculated();
			final boolean calculating = rh.isRouteBeingCalculated();
			final boolean deviated = following && rh.isDeviatedFromRoute();
			final Location loc = app.getLocationProvider().getLastKnownLocation();
			final NextDirectionInfo next = following && routed
					? rh.getNextRouteDirectionInfo(new NextDirectionInfo(), true) : null;
			final long now = System.currentTimeMillis();

			State() {
				if (loc != null && loc.hasBearing() && loc.getSpeed() > 1f) {
					bearing = loc.getBearing();
				}
			}

			/** Metres to the next stop or the destination, or -1 when not driving a route. */
			int arrivalDistance() {
				if (!following || !routed || deviated) {
					return -1;
				}
				boolean stop = !app.getTargetPointsHelper().getIntermediatePoints().isEmpty();
				int d = stop ? rh.getLeftDistanceNextIntermediate() : rh.getLeftDistance();
				return d > 0 ? d : -1;
			}

			boolean arrivingAtStop() {
				return !app.getTargetPointsHelper().getIntermediatePoints().isEmpty();
			}

			boolean arriving() {
				int d = arrivalDistance();
				return d >= 0 && d < 250;
			}

			boolean rerouting() {
				return following && (deviated || calculating);
			}

			/** Which side of the road the next stop or destination is on: RIGHT, LEFT or AHEAD. */
			String arrivalSide() {
				TargetPoint p = arrivingAtStop() ? app.getTargetPointsHelper().getFirstIntermediatePoint() : target;
				if (p == null || loc == null) {
					return "AHEAD";
				}
				double kx = Math.cos(Math.toRadians(loc.getLatitude()));
				double brg = Math.toDegrees(Math.atan2((p.getLongitude() - loc.getLongitude()) * kx, p.getLatitude() - loc.getLatitude()));
				double rel = ((brg - bearing) % 360 + 540) % 360 - 180;
				return rel > 15 ? "RIGHT" : rel < -15 ? "LEFT" : "AHEAD";
			}

			String destination() {
				String n = target != null ? target.getOnlyName() : null;
				return n == null || n.trim().isEmpty() ? "DESTINATION" : n.toUpperCase(Locale.ROOT);
			}

			String street() {
				try {
					RouteDataObject rdo = app.getLocationProvider().getLastKnownRouteSegment();
					if (rdo != null) {
						OsmandSettings st = app.getSettings();
						String n = rdo.getName(st.MAP_PREFERRED_LOCALE.get(), st.MAP_TRANSLITERATE_NAMES.get());
						if (n == null || n.isEmpty()) {
							n = rdo.getRef(st.MAP_PREFERRED_LOCALE.get(), st.MAP_TRANSLITERATE_NAMES.get(), true);
						}
						return n == null || n.isEmpty() ? "UNNAMED ROAD" : n.toUpperCase(Locale.ROOT);
					}
				} catch (RuntimeException e) {
					// no road data yet
				}
				return loc == null ? "NO GPS FIX" : "OFF ROAD";
			}

			String nextStreet() {
				if (next == null || next.directionInfo == null) {
					return null;
				}
				String n = next.directionInfo.getStreetName();
				if (n == null || n.isEmpty()) {
					n = next.directionInfo.getDestinationName();
				}
				return n == null || n.isEmpty() ? null : n.toUpperCase(Locale.ROOT);
			}

			float maxSpeed() {
				try {
					if (!following || deviated) {
						RouteDataObject rdo = app.getLocationProvider().getLastKnownRouteSegment();
						if (rdo != null && loc != null) {
							return rdo.getMaximumSpeed(rdo.bearingVsRouteDirection(loc));
						}
						return 0;
					}
					return rh.getCurrentMaxSpeed();
				} catch (RuntimeException e) {
					return 0;
				}
			}

			String eta(int seconds) {
				java.text.DateFormat f = android.text.format.DateFormat.getTimeFormat(getContext());
				return f.format(new Date(now + seconds * 1000L));
			}
		}

		private void drawLandscape(Canvas c, State s, int w, int h, float top, float bottom, float left, float right) {
			float sw = Math.max(Math.min(w * 0.3f, 300 * dp), Math.min(230 * dp, w * 0.45f)) + left;
			RectF panel = new RectF(0, 0, sw, h);
			panels.add(panel);
			fill.setColor(Color.BLACK);
			c.drawRect(panel, fill);
			line.setColor(PHOSPHOR);
			line.setAlpha(150);
			line.setStrokeWidth(1.2f * dp);
			c.drawLine(sw, 0, sw, h, line);

			float p = 14 * dp, x0 = left + p, x1 = sw - p;
			float y = top + p;
			y = header(c, s, x0, x1, y);
			y = mainBox(c, s, x0, x1, y);
			if (s.routed) {
				y = stopButtons(c, x0, x1, y);
			}
			y = speedBlock(c, s, x0, x1, y);

			// buttons at the bottom of the sidebar: 2 per row, or 3 when 2 would run into the blocks
			// above. On a short screen (a phone on its side) they go in a bar under the map instead.
			List<Object[]> btns = buttons(s);
			float bh = 38 * dp, gap = 8 * dp;
			int cols = 2;
			int rows = (btns.size() + cols - 1) / cols;
			if (h - bottom - p - rows * bh - (rows - 1) * gap < y + 8 * dp) {
				cols = 3;
				bh = 34 * dp;
				gap = 6 * dp;
				rows = (btns.size() + cols - 1) / cols;
			}
			float mapBottom = h - bottom - 14 * dp;
			float by = h - bottom - p - rows * bh - (rows - 1) * gap;
			if (by < y + 8 * dp) {
				float mx0 = sw + 14 * dp, mx1 = w - right - 14 * dp;
				cols = btns.size() <= 6 ? btns.size() : (btns.size() + 1) / 2;
				rows = (btns.size() + cols - 1) / cols;
				bh = 36 * dp;
				gap = 6 * dp;
				by = h - bottom - 10 * dp - rows * bh - (rows - 1) * gap;
				RectF bar = new RectF(sw, by - 10 * dp, w, h);
				panels.add(bar);
				fill.setColor(Color.BLACK);
				c.drawRect(bar, fill);
				line.setColor(PHOSPHOR);
				line.setAlpha(150);
				line.setStrokeWidth(1.2f * dp);
				c.drawLine(sw, bar.top, w, bar.top, line);
				float bw = (mx1 - mx0 - gap * (cols - 1)) / cols;
				for (int i = 0; i < btns.size(); i++) {
					float bx = mx0 + (i % cols) * (bw + gap);
					float yy = by + (i / cols) * (bh + gap);
					button(c, new RectF(bx, yy, bx + bw, yy + bh), (String) btns.get(i)[0], (Runnable) btns.get(i)[1]);
				}
				mapBottom = bar.top - 12 * dp;
				if (h - bottom - p - y > 70 * dp) {
					minimap(c, s, new RectF(x0, y, x1, h - bottom - p));
				}
			} else {
				float bw = (x1 - x0 - gap * (cols - 1)) / cols;
				for (int i = 0; i < btns.size(); i++) {
					float bx = x0 + (i % cols) * (bw + gap);
					float yy = by + (i / cols) * (bh + gap);
					button(c, new RectF(bx, yy, bx + bw, yy + bh), (String) btns.get(i)[0], (Runnable) btns.get(i)[1]);
				}
				if (by - gap - y > 70 * dp) {
					minimap(c, s, new RectF(x0, y, x1, by - gap));
				}
			}

			mapOverlay(c, s, sw + 14 * dp, top + 14 * dp, w - right - 14 * dp, mapBottom);
		}

		private void drawPortrait(Canvas c, State s, int w, int h, float top, float bottom, float left, float right) {
			float p = 12 * dp, x0 = left + p, x1 = w - right - p;
			// measure: header 64, box 66, stops 48, speed block 96
			float ph = top + p + 64 * dp + 66 * dp + (s.routed ? 48 * dp : 0) + 96 * dp + 4 * dp;
			RectF panel = new RectF(0, 0, w, ph);
			panels.add(panel);
			fill.setColor(Color.BLACK);
			c.drawRect(panel, fill);
			line.setColor(PHOSPHOR);
			line.setAlpha(150);
			line.setStrokeWidth(1.2f * dp);
			c.drawLine(0, ph, w, ph, line);

			float y = top + p;
			y = header(c, s, x0, x1, y);
			y = mainBox(c, s, x0, x1, y);
			if (s.routed) {
				y = stopButtons(c, x0, x1, y);
			}
			float split = x0 + (x1 - x0) * 0.58f;
			speedBlock(c, s, x0, split - 8 * dp, y);
			minimap(c, s, new RectF(split, y, x1, y + 88 * dp));

			// button bar: one row of up to 5, otherwise two rows, so every label stays readable
			List<Object[]> btns = buttons(s);
			float bh = 40 * dp, gap = 6 * dp;
			int cols = btns.size() <= 5 ? btns.size() : (btns.size() + 1) / 2;
			int rows = (btns.size() + cols - 1) / cols;
			float by = h - bottom - p - rows * bh - (rows - 1) * gap;
			RectF bar = new RectF(0, by - p, w, h);
			panels.add(bar);
			fill.setColor(Color.BLACK);
			c.drawRect(bar, fill);
			line.setColor(PHOSPHOR);
			line.setAlpha(150);
			line.setStrokeWidth(1.2f * dp);
			c.drawLine(0, bar.top, w, bar.top, line);
			float bw = (x1 - x0 - gap * (cols - 1)) / cols;
			for (int i = 0; i < btns.size(); i++) {
				float bx = x0 + (i % cols) * (bw + gap);
				float yy = by + (i / cols) * (bh + gap);
				button(c, new RectF(bx, yy, bx + bw, yy + bh), (String) btns.get(i)[0], (Runnable) btns.get(i)[1]);
			}

			mapOverlay(c, s, x0, ph + 12 * dp, x1, bar.top - 12 * dp);
		}

		private List<Object[]> buttons(State s) {
			List<Object[]> b = new ArrayList<>();
			b.add(new Object[] {"MENU", (Runnable) this::openMenu});
			b.add(new Object[] {"CENTER", (Runnable) this::recenter});
			boolean night = app.getDaynightHelper().isNightMode(ThemeUsageContext.MAP);
			b.add(new Object[] {night ? "DAY" : "NIGHT", (Runnable) this::toggleDayNight});
			b.add(new Object[] {"VEHICLE", (Runnable) this::pickVehicle});
			b.add(new Object[] {"THEME", (Runnable) this::nextTheme});
			b.add(new Object[] {"STOCK UI", (Runnable) () -> setOn(false)});
			if (s.routed && !s.following) {
				b.add(new Object[] {"START", (Runnable) () -> act.getMapActions().startNavigation()});
			}
			if (s.following || s.routed) {
				b.add(new Object[] {"STOP", (Runnable) () -> act.getMapActions().stopNavigationActionConfirm(null)});
			}
			return b;
		}

		/** Logo, "cyberNAV", destination or STANDBY, mode line. */
		private float header(Canvas c, State s, float x0, float x1, float y) {
			float lg = 18 * dp;
			path.reset();
			path.moveTo(x0 + lg / 2, y);
			path.lineTo(x0 + lg, y + lg / 2);
			path.lineTo(x0 + lg / 2, y + lg);
			path.lineTo(x0, y + lg / 2);
			path.close();
			line.setColor(PHOSPHOR);
			line.setAlpha(255);
			line.setStrokeWidth(1.8f * dp);
			c.drawPath(path, line);
			fill.setColor(PHOSPHOR);
			c.drawCircle(x0 + lg / 2, y + lg / 2, 2.5f * dp, fill);
			txt(c, "cyberNAV", x0 + lg + 8 * dp, y + lg - 2 * dp, 22, PHOSPHOR, x1 - x0 - lg - 8 * dp, false);
			y += lg + 18 * dp;
			String sub = s.target != null ? "DEST ▸ " + s.destination() : "STANDBY";
			txt(c, sub, x0, y, 12, s.target != null ? PHOSPHOR : LABEL, x1 - x0, false);
			y += 16 * dp;
			String mode = "MODE GROUND · " + (s.loc != null ? "GPS LOCK" : "NO FIX");
			txt(c, mode, x0, y, 11, LABEL, x1 - x0, false);
			return y + 12 * dp;
		}

		/** Off a route: the route search bar. On a route: next stop ETA / route ETA. */
		private float mainBox(Canvas c, State s, float x0, float x1, float y) {
			RectF r = new RectF(x0, y, x1, y + 58 * dp);
			if (s.routed) {
				frame(c, r, PHOSPHOR, false);
				int all = s.rh.getLeftTime();
				int nxt = s.rh.getLeftTimeNextIntermediate();
				if (nxt <= 0) {
					nxt = all;
				}
				txt(c, "ETA  NEXT / END", r.left + 10 * dp, r.top + 17 * dp, 11, LABEL, r.width() - 20 * dp, false);
				txt(c, s.eta(nxt) + " / " + s.eta(all), r.left + 10 * dp, r.bottom - 11 * dp, 22, PHOSPHOR, r.width() - 20 * dp, false);
			} else {
				boolean down = pressed != null && pressed.r.equals(r);
				frame(c, r, PHOSPHOR, down);
				txt(c, "ROUTE SEARCH", r.left + 10 * dp, r.top + 17 * dp, 11, LABEL, r.width() - 20 * dp, false);
				String cursor = (s.now / 600) % 2 == 0 ? "_" : " ";
				txt(c, "> ENTER DESTINATION" + cursor, r.left + 10 * dp, r.bottom - 13 * dp, 15, down ? Color.BLACK : PHOSPHOR, r.width() - 20 * dp, false);
				hits.add(new Hit(r, () -> search(NONE)));
			}
			return r.bottom + 8 * dp;
		}

		private float stopButtons(Canvas c, float x0, float x1, float y) {
			float gap = 8 * dp, half = (x1 - x0 - gap) / 2f;
			button(c, new RectF(x0, y, x0 + half, y + 40 * dp), "+ ADD STOP", () -> search(NEXT));
			button(c, new RectF(x1 - half, y, x1, y + 40 * dp), "+ ADD ENDPOINT", () -> search(END));
			return y + 48 * dp;
		}

		/** Speed limit sign, current street, next street and distance. */
		private float speedBlock(Canvas c, State s, float x0, float x1, float y) {
			float r = 30 * dp, cx = x0 + r, cy = y + r + 4 * dp;
			float limit = s.maxSpeed();
			boolean over = limit > 0 && limit != RouteDataObject.NONE_MAX_SPEED && s.loc != null
					&& s.loc.getSpeed() > limit * 1.05f;
			line.setColor(over ? ALERT : PHOSPHOR);
			line.setAlpha(255);
			line.setStrokeWidth(3 * dp);
			c.drawCircle(cx, cy, r - 2 * dp, line);
			String lim = "--";
			if (limit == RouteDataObject.NONE_MAX_SPEED) {
				lim = "∞";
			} else if (limit > 0) {
				FormattedValue fv = OsmAndFormatter.getFormattedSpeedValue(limit, app);
				lim = fv.value;
			}
			text.setTextAlign(Paint.Align.CENTER);
			txt(c, lim, cx, cy + 8 * dp, 22, over ? ALERT : PHOSPHOR, 2 * r - 8 * dp, true);
			txt(c, "LIMIT", cx, cy + r + 13 * dp, 9, LABEL, 2 * r, true);
			text.setTextAlign(Paint.Align.LEFT);

			float tx = x0 + 2 * r + 12 * dp, tw = x1 - tx;
			txt(c, "ON", tx, y + 14 * dp, 10, LABEL, tw, false);
			txt(c, s.street(), tx, y + 31 * dp, 14, PHOSPHOR, tw, false);
			String ns = s.nextStreet();
			if (s.next != null) {
				String dist = OsmAndFormatter.getFormattedDistance(s.next.distanceTo, app);
				txt(c, "NEXT ▸ IN " + dist.toUpperCase(Locale.ROOT), tx, y + 50 * dp, 10, LABEL, tw, false);
				txt(c, ns != null ? ns : turnWord(s.next), tx, y + 67 * dp, 13, PHOSPHOR, tw, false);
			} else {
				txt(c, "NEXT ▸ --", tx, y + 50 * dp, 10, LABEL, tw, false);
			}
			return y + 92 * dp;
		}

		/** Heading-up route overview: the route from above, you at the arrow. */
		private void minimap(Canvas c, State s, RectF m) {
			frame(c, m, LABEL, false);
			txt(c, "ROUTE MAP", m.left + 8 * dp, m.top + 14 * dp, 9, LABEL, m.width() - 16 * dp, false);
			c.save();
			c.clipRect(m.left + 2 * dp, m.top + 2 * dp, m.right - 2 * dp, m.bottom - 2 * dp);
			float cx = m.centerX(), cy = m.top + m.height() * 0.62f;
			line.setColor(DIM);
			line.setAlpha(140);
			line.setStrokeWidth(1.3f * dp);
			float ring = Math.min(m.width(), m.height()) * 0.36f;
			c.drawCircle(cx, cy, ring, line);
			c.drawCircle(cx, cy, ring / 2f, line);
			c.drawLine(m.left, cy, m.right, cy, line);
			c.drawLine(cx, m.top, cx, m.bottom, line);

			RouteCalculationResult route = s.routed ? s.rh.getRoute() : null;
			List<Location> pts = route != null ? route.getImmutableAllLocations() : null;
			if (pts != null && pts.size() > 1 && s.loc != null) {
				double lat0 = s.loc.getLatitude(), lon0 = s.loc.getLongitude();
				double kx = Math.cos(Math.toRadians(lat0)) * 111320.0, ky = 110540.0;
				int cur = Math.max(0, Math.min(route.getCurrentRoute(), pts.size() - 1));
				double far = 0;
				int look = Math.min(pts.size(), cur + 4000);
				for (int i = cur; i < look; i += 4) {
					Location l = pts.get(i);
					far = Math.max(far, Math.hypot((l.getLongitude() - lon0) * kx, (l.getLatitude() - lat0) * ky));
				}
				double range = Math.max(400, Math.min(6000, far));
				double scale = ring / range;
				double b = Math.toRadians(bearing), cos = Math.cos(b), sin = Math.sin(b);
				int step = Math.max(1, pts.size() / 900);
				if (route != lastRoute) {
					// a new route while driving: keep the one it replaced, dashed, for a while
					if (lastRoute != null && s.following && lastRoute.getImmutableAllLocations() != null
							&& lastRoute.getImmutableAllLocations().size() > 1) {
						oldRoute = lastRoute.getImmutableAllLocations();
						oldRouteUntil = s.now + 90_000L;
					}
					lastRoute = route;
				}
				if (oldRoute != null && s.now < oldRouteUntil) {
					trace(oldRoute, 0, oldRoute.size(), Math.max(1, oldRoute.size() / 900), lat0, lon0, kx, ky, cos, sin, scale, cx, cy);
					line.setColor(DIM);
					line.setAlpha(170);
					line.setStrokeWidth(1.4f * dp);
					line.setPathEffect(new DashPathEffect(new float[] {4 * dp, 4 * dp}, 0));
					c.drawPath(path, line);
					line.setPathEffect(null);
				}
				for (int pass = 0; pass < 2; pass++) {
					int from = pass == 0 ? 0 : cur, to = pass == 0 ? cur + 1 : pts.size();
					trace(pts, from, to, step, lat0, lon0, kx, ky, cos, sin, scale, cx, cy);
					line.setColor(pass == 0 ? DIM : ROUTE);
					line.setAlpha(pass == 0 ? 110 : 255);
					line.setStrokeWidth((pass == 0 ? 2f : 3.2f) * dp);
					c.drawPath(path, line);
				}
				Location end = pts.get(pts.size() - 1);
				double ex = (end.getLongitude() - lon0) * kx, ey = (end.getLatitude() - lat0) * ky;
				float dx = (float) (cx + (ex * cos - ey * sin) * scale), dy = (float) (cy - (ex * sin + ey * cos) * scale);
				line.setColor(ROUTE);
				line.setAlpha(255);
				line.setStrokeWidth(1.8f * dp);
				if ((s.now / 500) % 2 == 0) {
					c.drawCircle(dx, dy, 5 * dp, line);
				}
				fill.setColor(ROUTE);
				c.drawCircle(dx, dy, 1.8f * dp, fill);
				String scaleTxt = OsmAndFormatter.getFormattedDistance((float) range, app).toUpperCase(Locale.ROOT);
				text.setTextAlign(Paint.Align.RIGHT);
				txt(c, "R " + scaleTxt, m.right - 8 * dp, m.bottom - 8 * dp, 9, LABEL, m.width(), false);
				text.setTextAlign(Paint.Align.LEFT);
			} else {
				text.setTextAlign(Paint.Align.CENTER);
				txt(c, "NO ROUTE", cx, m.bottom - 10 * dp, 10, LABEL, m.width(), true);
				text.setTextAlign(Paint.Align.LEFT);
			}
			path.reset();
			path.moveTo(cx, cy - 7 * dp);
			path.lineTo(cx + 5 * dp, cy + 5 * dp);
			path.lineTo(cx, cy + 2 * dp);
			path.lineTo(cx - 5 * dp, cy + 5 * dp);
			path.close();
			fill.setColor(PHOSPHOR);
			c.drawPath(path, fill);
			c.restore();
		}

		/** Puts route points from..to (every step-th, always the last) into path, heading-up around (cx, cy). */
		private void trace(List<Location> pts, int from, int to, int step, double lat0, double lon0, double kx, double ky,
				double cos, double sin, double scale, float cx, float cy) {
			path.reset();
			boolean first = true;
			for (int i = from; i < to; i = (i + step < to || i == to - 1) ? i + step : to - 1) {
				Location l = pts.get(i);
				double x = (l.getLongitude() - lon0) * kx, yy = (l.getLatitude() - lat0) * ky;
				float sx = (float) (cx + (x * cos - yy * sin) * scale);
				float sy = (float) (cy - (x * sin + yy * cos) * scale);
				if (first) {
					path.moveTo(sx, sy);
					first = false;
				} else {
					path.lineTo(sx, sy);
				}
			}
		}

		/** Next manoeuvre, heading tape, ETA/distance/speed and the status line, over the map. */
		private void mapOverlay(Canvas c, State s, float l, float t, float r, float b) {
			// route alert, top left: transparent with outlined text so it reads over the wireframe
			boolean blink = (s.now / 500) % 2 == 0;
			float tw = Math.min(220 * dp, (r - l) * 0.45f); // heading tape width, top right
			float aw = Math.min(r - l - tw - 10 * dp, 260 * dp); // the alert stays clear of the tape
			if (s.rerouting()) {
				if (blink) {
					fit(c, "ROUTE OBSTRUCTED", l, t + 24 * dp, 22, ALERT, aw);
				}
				txt(c, s.deviated ? "OFF ROUTE · FINDING A NEW WAY" : "ROUTE CHANGED", l, t + 44 * dp, 11, ALERT, aw, true);
				float sx = l + 9 * dp, sy = t + 64 * dp;
				line.setColor(ALERT);
				line.setAlpha(255);
				line.setStrokeWidth(2.2f * dp);
				float sweep = (s.now % 1000) / 1000f * 360f;
				c.drawArc(new RectF(sx - 7 * dp, sy - 7 * dp, sx + 7 * dp, sy + 7 * dp), sweep, 270, false, line);
				txt(c, "RECALCULATING", l + 24 * dp, sy + 5 * dp, 12, ALERT, aw - 24 * dp, true);
			} else if (s.arriving()) {
				if (blink) {
					fit(c, "ARRIVING", l, t + 34 * dp, 32, PHOSPHOR, aw);
				}
				String what = s.arrivingAtStop() ? "STOP" : "DESTINATION";
				String dist = OsmAndFormatter.getFormattedDistance(s.arrivalDistance(), app).toUpperCase(Locale.ROOT);
				String side = s.arrivalSide();
				txt(c, what + " " + dist + ("AHEAD".equals(side) ? " AHEAD" : " ON " + side), l, t + 56 * dp, 12, PHOSPHOR, aw, true);
				txt(c, "▸ PULL TO CURB", l, t + 74 * dp, 12, LABEL, aw, true);
			} else if (s.next != null && s.next.directionInfo != null) {
				txt(c, "NEXT MANEUVER", l, t + 12 * dp, 10, LABEL, aw, true);
				drawArrow(c, s.next.directionInfo.getTurnType(), l + 26 * dp, t + 48 * dp, 22 * dp);
				String dist = OsmAndFormatter.getFormattedDistance(s.next.distanceTo, app).toUpperCase(Locale.ROOT);
				float tx = l + 62 * dp, tw2 = aw - 62 * dp;
				fit(c, dist, tx, t + 50 * dp, 28, PHOSPHOR, tw2);
				String ns = s.nextStreet();
				txt(c, turnWord(s.next) + (ns != null ? " ▸ " + ns : ""), l, t + 86 * dp, 12, PHOSPHOR, aw, true);
			}

			// heading tape, top right
			RectF tape = new RectF(r - tw, t, r, t + 40 * dp);
			fill.setColor(Color.BLACK);
			fill.setAlpha(170);
			c.drawRect(tape, fill);
			fill.setAlpha(255);
			c.save();
			c.clipRect(tape);
			float pxPerDeg = tw / 120f;
			int startDeg = (int) Math.floor((bearing - 60) / 5f) * 5;
			line.setColor(PHOSPHOR);
			line.setStrokeWidth(1.2f * dp);
			text.setTextAlign(Paint.Align.CENTER);
			for (int d = startDeg; d <= bearing + 60; d += 5) {
				float x = tape.centerX() + (d - bearing) * pxPerDeg;
				int nd = ((d % 360) + 360) % 360;
				line.setAlpha(nd % 10 == 0 ? 220 : 110);
				c.drawLine(x, tape.top, x, tape.top + (nd % 10 == 0 ? 10 : 5) * dp, line);
				if (nd % 30 == 0) {
					String lab = nd == 0 ? "N" : nd == 90 ? "E" : nd == 180 ? "S" : nd == 270 ? "W" : String.format(Locale.ROOT, "%03d", nd);
					txt(c, lab, x, tape.top + 22 * dp, 10, nd % 90 == 0 ? PHOSPHOR : LABEL, 40 * dp, true);
				}
			}
			c.restore();
			line.setAlpha(255);
			path.reset();
			path.moveTo(tape.centerX(), tape.top + 12 * dp);
			path.lineTo(tape.centerX() - 4 * dp, tape.top + 4 * dp);
			path.lineTo(tape.centerX() + 4 * dp, tape.top + 4 * dp);
			path.close();
			fill.setColor(ROUTE);
			c.drawPath(path, fill);
			txt(c, String.format(Locale.ROOT, "HDG %03d", Math.round((bearing % 360 + 360) % 360) % 360),
					tape.centerX(), tape.bottom - 3 * dp, 10, PHOSPHOR, tw, true);
			text.setTextAlign(Paint.Align.LEFT);
			line.setColor(LABEL);
			line.setStrokeWidth(1.5f * dp);
			c.drawRect(tape, line);

			// ETA and distance left, bottom right (no speedometer: the speed limit replaces it)
			if (s.routed) {
				List<String[]> rows = new ArrayList<>();
				rows.add(new String[] {"ETA", s.eta(s.rh.getLeftTime())});
				rows.add(new String[] {"DIST", OsmAndFormatter.getFormattedDistance(s.rh.getLeftDistance(), app).toUpperCase(Locale.ROOT)});
				float rh = 20 * dp, bw = 170 * dp;
				RectF read = new RectF(r - bw, b - rows.size() * rh - 30 * dp, r, b - 22 * dp);
				panels.add(read);
				frame(c, read, PHOSPHOR, false);
				for (int i = 0; i < rows.size(); i++) {
					float yy = read.top + (i + 1) * rh;
					txt(c, rows.get(i)[0], read.left + 10 * dp, yy, 10, LABEL, 50 * dp, false);
					text.setTextAlign(Paint.Align.RIGHT);
					txt(c, rows.get(i)[1], read.right - 10 * dp, yy, 15, PHOSPHOR, bw - 60 * dp, false);
					text.setTextAlign(Paint.Align.LEFT);
				}
			}

			recenterRing(c, l, b);

			// status line, bottom centre
			String status;
			int col = PHOSPHOR;
			if (s.calculating) {
				status = "> RECALCULATING";
				col = ALERT;
			} else if (s.deviated) {
				status = "> OFF ROUTE";
				col = ALERT;
			} else if (s.arriving()) {
				status = "> ARRIVING";
			} else if (s.following) {
				status = "> FOLLOW ROUTE";
			} else if (s.routed) {
				status = "> ROUTE READY";
			} else {
				status = "> STANDBY";
			}
			status += (s.now / 600) % 2 == 0 ? "_" : " ";
			text.setTextAlign(Paint.Align.CENTER);
			txt(c, status, (l + r) / 2f, b - 2 * dp, 13, col, r - l, true);
			text.setTextAlign(Paint.Align.LEFT);
		}

		private String turnWord(NextDirectionInfo n) {
			TurnType t = n.directionInfo != null ? n.directionInfo.getTurnType() : null;
			if (t == null) {
				return "CONTINUE";
			}
			if (t.isRoundAbout()) {
				return "ROUNDABOUT EXIT " + t.getExitOut();
			}
			switch (t.getValue()) {
				case TurnType.TL: return "LEFT";
				case TurnType.TSLL: return "SLIGHT LEFT";
				case TurnType.TSHL: return "SHARP LEFT";
				case TurnType.TR: return "RIGHT";
				case TurnType.TSLR: return "SLIGHT RIGHT";
				case TurnType.TSHR: return "SHARP RIGHT";
				case TurnType.KL: return "KEEP LEFT";
				case TurnType.KR: return "KEEP RIGHT";
				case TurnType.TU:
				case TurnType.TRU: return "U-TURN";
				default: return "STRAIGHT";
			}
		}

		/** A phosphor arrow for the turn: stem up from the bottom, then bending into the turn. */
		private void drawArrow(Canvas c, TurnType t, float cx, float cy, float size) {
			line.setColor(PHOSPHOR);
			line.setAlpha(255);
			line.setStrokeWidth(4.5f * dp);
			if (t != null && t.isRoundAbout()) {
				c.drawCircle(cx, cy - size * 0.15f, size * 0.42f, line);
				c.drawLine(cx, cy + size, cx, cy + size * 0.27f, line);
				text.setTextAlign(Paint.Align.CENTER);
				txt(c, String.valueOf(t.getExitOut()), cx, cy - size * 0.15f + 6 * dp, 16, PHOSPHOR, size, true);
				text.setTextAlign(Paint.Align.LEFT);
				return;
			}
			int v = t != null ? t.getValue() : TurnType.C;
			if (v == TurnType.TU || v == TurnType.TRU) {
				float dir = v == TurnType.TRU ? 1 : -1;
				path.reset();
				path.moveTo(cx - dir * size * 0.35f, cy + size);
				path.lineTo(cx - dir * size * 0.35f, cy - size * 0.2f);
				path.quadTo(cx, cy - size, cx + dir * size * 0.35f, cy - size * 0.2f);
				path.lineTo(cx + dir * size * 0.35f, cy + size * 0.35f);
				c.drawPath(path, line);
				arrowHead(c, cx + dir * size * 0.35f, cy + size * 0.35f, 180);
				return;
			}
			float angle;
			switch (v) {
				case TurnType.TL: angle = -90; break;
				case TurnType.TSLL: angle = -45; break;
				case TurnType.TSHL: angle = -135; break;
				case TurnType.TR: angle = 90; break;
				case TurnType.TSLR: angle = 45; break;
				case TurnType.TSHR: angle = 135; break;
				case TurnType.KL: angle = -25; break;
				case TurnType.KR: angle = 25; break;
				default: angle = 0; break;
			}
			float midY = cy + size * 0.1f;
			double a = Math.toRadians(angle);
			float len = size * 0.85f;
			float ex = (float) (cx + Math.sin(a) * len), ey = (float) (midY - Math.cos(a) * len);
			c.drawLine(cx, cy + size, cx, midY, line);
			c.drawLine(cx, midY, ex, ey, line);
			arrowHead(c, ex, ey, angle);
		}

		private void arrowHead(Canvas c, float x, float y, float angleDeg) {
			c.save();
			c.rotate(angleDeg, x, y);
			path.reset();
			path.moveTo(x, y - 9 * dp);
			path.lineTo(x + 8 * dp, y + 3 * dp);
			path.lineTo(x - 8 * dp, y + 3 * dp);
			path.close();
			fill.setColor(PHOSPHOR);
			c.drawPath(path, fill);
			c.restore();
		}

		// ---------------------------------------------------------------- primitives

		/** A clipped-corner HUD panel: black fill, phosphor edge; filled phosphor when pressed. */
		private void frame(Canvas c, RectF r, int color, boolean down) {
			float k = 8 * dp;
			path.reset();
			path.moveTo(r.left, r.top);
			path.lineTo(r.right - k, r.top);
			path.lineTo(r.right, r.top + k);
			path.lineTo(r.right, r.bottom);
			path.lineTo(r.left + k, r.bottom);
			path.lineTo(r.left, r.bottom - k);
			path.close();
			fill.setColor(down ? color : PANEL);
			fill.setAlpha(down ? 255 : 238);
			c.drawPath(path, fill);
			fill.setAlpha(255);
			line.setColor(color);
			line.setAlpha(255);
			line.setStrokeWidth(2f * dp);
			c.drawPath(path, line);
			line.setAlpha(255);
		}

		private void button(Canvas c, RectF r, String label, Runnable run) {
			boolean down = pressed != null && pressed.r.equals(r);
			frame(c, r, PHOSPHOR, down);
			text.setTextAlign(Paint.Align.CENTER);
			fit(c, label, r.centerX(), r.centerY() + 5.5f * dp, 15, down ? Color.BLACK : PHOSPHOR, r.width() - 8 * dp);
			text.setTextAlign(Paint.Align.LEFT);
			hits.add(new Hit(r, run));
		}

		/** Draws a big HUD word, shrunk (down to 60%) rather than cut when it is wider than maxW. */
		private void fit(Canvas c, String s, float x, float y, float size, int color, float maxW) {
			text.setTextSize(size * dp);
			float wd = text.measureText(s);
			float k = wd > maxW && wd > 0 ? Math.max(0.6f, maxW / wd) : 1f;
			draw(c, s, x, y, size * k, color, maxW, true);
		}

		/** The colour at fraction f of its brightness, over black. */
		private int mix(int color, float f) {
			return Color.argb(255, Math.round((color >> 16 & 0xFF) * f), Math.round((color >> 8 & 0xFF) * f), Math.round((color & 0xFF) * f));
		}

		/**
		 * Draws one line of HUD text, cut to fit maxW. Size in dp; glow adds the black outline. Since
		 * v0.0.23 small text is drawn up to 20% bigger (labels of 9-11 dp were hard to read at night).
		 */
		private void txt(Canvas c, String s, float x, float y, float size, int color, float maxW, boolean glow) {
			draw(c, s, x, y, size < 14 ? Math.min(size * 1.2f, 14) : size, color, maxW, glow);
		}

		private void draw(Canvas c, String s, float x, float y, float size, int color, float maxW, boolean glow) {
			if (s == null) {
				return;
			}
			text.setTextSize(size * dp);
			text.setColor(color);
			if (color == Color.BLACK) { // black text sits on a lit button: no outline
				text.clearShadowLayer();
			} else {
				text.setShadowLayer(4 * dp, 0, 0, Color.BLACK);
			}
			if (maxW > 0 && text.measureText(s) > maxW) {
				int n = text.breakText(s, true, maxW - text.measureText("…"), null);
				s = s.substring(0, Math.max(0, n)) + "…";
			}
			c.drawText(s, x, y, text);
		}
	}
}
