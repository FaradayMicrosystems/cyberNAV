package net.osmand.plus.cybernav;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * cyberNAV in-app updates. cyberNAV is sideloaded, so it updates itself from the GitHub release
 * that CI publishes ("cybernav-osmand-latest"): on launch it compares the release's build number
 * with its own versionCode, shows a Phosphor HUD prompt, downloads the APK with DownloadManager
 * and hands it to Android's package installer. Part of the cyberNAV skin (GPLv3), not OsmAnd.
 */
public final class CyberUpdater {
	private static final String RELEASE_API =
			"https://api.github.com/repos/FaradayMicrosystems/cyberNAV/releases/tags/cybernav-osmand-latest";
	private static final long CHECK_EVERY_MS = 60 * 60 * 1000L; // at most hourly
	private static final String PREFS = "cybernav_updater";
	private static final int GROUND = Color.parseColor("#020503");
	private static final int PANEL = Color.parseColor("#07140A");
	private static final int PHOSPHOR = Color.parseColor("#B8FF7A");
	private static final int DIM = Color.parseColor("#4E7A2C");

	private static boolean running;

	private CyberUpdater() {
	}

	/** Called from MapActivity.onResume. Cheap: returns at once unless a check is due. */
	public static void check(Activity activity) {
		SharedPreferences p = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
		resumePendingInstall(activity.getApplicationContext(), p);
		long now = System.currentTimeMillis();
		if (running || now - p.getLong("lastCheck", 0) < CHECK_EVERY_MS) return;
		running = true;
		p.edit().putLong("lastCheck", now).apply();
		Context app = activity.getApplicationContext();
		new Thread(() -> {
			try {
				Release r = fetch();
				long current = currentBuild(app);
				if (r != null && r.build > current && r.build != p.getLong("skipped", -1)) {
					new Handler(Looper.getMainLooper()).post(() -> prompt(activity, r));
				}
			} catch (Exception ignored) {
				// Offline or GitHub unreachable: try again next time.
			} finally {
				running = false;
			}
		}, "cybernav-update-check").start();
	}

	static final class Release {
		long build;
		String url;
		long size;
	}

	private static Release fetch() throws Exception {
		HttpURLConnection c = (HttpURLConnection) new URL(RELEASE_API).openConnection();
		c.setConnectTimeout(10000);
		c.setReadTimeout(15000);
		c.setRequestProperty("Accept", "application/vnd.github+json");
		c.setRequestProperty("User-Agent", "cyberNAV-updater");
		try {
			if (c.getResponseCode() != 200) return null;
			JSONObject json = new JSONObject(read(c.getInputStream()));
			Matcher m = Pattern.compile("build=(\\d+)").matcher(json.optString("body", ""));
			if (!m.find()) return null;
			JSONArray assets = json.optJSONArray("assets");
			if (assets == null) return null;
			for (int i = 0; i < assets.length(); i++) {
				JSONObject a = assets.getJSONObject(i);
				if (a.optString("name").endsWith(".apk")) {
					Release r = new Release();
					r.build = Long.parseLong(m.group(1));
					r.url = a.getString("browser_download_url");
					r.size = a.optLong("size", 0);
					return r;
				}
			}
			return null;
		} finally {
			c.disconnect();
		}
	}

	private static String read(InputStream in) throws Exception {
		try (InputStream s = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			byte[] buf = new byte[8192];
			int n;
			while ((n = s.read(buf)) > 0) out.write(buf, 0, n);
			return out.toString("UTF-8");
		}
	}

	@SuppressWarnings("deprecation")
	private static long currentBuild(Context ctx) throws Exception {
		PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
		return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
	}

	// ---------- Phosphor HUD prompt ----------

	private static void prompt(Activity activity, Release r) {
		if (activity.isFinishing() || activity.isDestroyed()) return;
		float d = activity.getResources().getDisplayMetrics().density;
		LinearLayout box = new LinearLayout(activity);
		box.setOrientation(LinearLayout.VERTICAL);
		int pad = (int) (20 * d);
		box.setPadding(pad, pad, pad, pad);
		GradientDrawable bg = new GradientDrawable();
		bg.setColor(PANEL);
		bg.setStroke((int) Math.max(1, d), PHOSPHOR);
		box.setBackground(bg);

		box.addView(text(activity, "UPDATE AVAILABLE // BUILD " + r.build, 15, PHOSPHOR, true));
		String mb = r.size > 0 ? String.format(java.util.Locale.US, "%.0f MB", r.size / 1048576.0) : "";
		TextView body = text(activity, "A NEW CYBERNAV BUILD IS READY. " + mb + " DOWNLOAD. "
				+ "INSTALLING KEEPS YOUR MAPS AND SETTINGS.", 12, DIM, false);
		body.setPadding(0, (int) (10 * d), 0, (int) (16 * d));
		box.addView(body);

		LinearLayout row = new LinearLayout(activity);
		row.setGravity(Gravity.END);
		Button skip = button(activity, "SKIP", false, d);
		Button later = button(activity, "LATER", false, d);
		Button install = button(activity, "INSTALL", true, d);
		row.addView(skip);
		row.addView(later);
		row.addView(install);
		box.addView(row);

		AlertDialog dialog = new AlertDialog.Builder(activity).setView(box).create();
		skip.setOnClickListener(v -> {
			activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("skipped", r.build).apply();
			dialog.dismiss();
		});
		later.setOnClickListener(v -> dialog.dismiss());
		install.setOnClickListener(v -> {
			dialog.dismiss();
			download(activity.getApplicationContext(), r);
		});
		dialog.show();
		if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
	}

	private static TextView text(Context ctx, String s, int sp, int color, boolean bold) {
		TextView t = new TextView(ctx);
		t.setText(s);
		t.setTextColor(color);
		t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
		t.setLetterSpacing(0.12f);
		t.setTypeface(Typeface.MONOSPACE, bold ? Typeface.BOLD : Typeface.NORMAL);
		return t;
	}

	private static Button button(Context ctx, String s, boolean primary, float d) {
		Button b = new Button(ctx);
		b.setText(s);
		b.setAllCaps(true);
		b.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
		b.setLetterSpacing(0.15f);
		b.setTextColor(primary ? GROUND : PHOSPHOR);
		GradientDrawable g = new GradientDrawable();
		g.setColor(primary ? PHOSPHOR : GROUND);
		g.setStroke((int) Math.max(1, d), PHOSPHOR);
		b.setBackground(g);
		LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
				LinearLayout.LayoutParams.WRAP_CONTENT, (int) (40 * d));
		lp.leftMargin = (int) (8 * d);
		b.setLayoutParams(lp);
		b.setPadding((int) (12 * d), 0, (int) (12 * d), 0);
		return b;
	}

	// ---------- download and install ----------

	private static void download(Context ctx, Release r) {
		DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
		DownloadManager.Request req = new DownloadManager.Request(Uri.parse(r.url))
				.setTitle("cyberNAV build " + r.build)
				.setDescription("Downloading update")
				.setMimeType("application/vnd.android.package-archive")
				.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
				.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, "cyberNAV-build-" + r.build + ".apk");
		long id = dm.enqueue(req);
		ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("pending", id).apply();
		Toast.makeText(ctx, "CYBERNAV // DOWNLOADING UPDATE", Toast.LENGTH_SHORT).show();
		BroadcastReceiver done = new BroadcastReceiver() {
			@Override
			public void onReceive(Context c, Intent intent) {
				if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
				try {
					ctx.unregisterReceiver(this);
				} catch (Exception ignored) {
				}
				Uri apk = dm.getUriForDownloadedFile(id);
				if (apk == null) {
					Toast.makeText(ctx, "CYBERNAV // UPDATE DOWNLOAD FAILED", Toast.LENGTH_LONG).show();
					return;
				}
				install(ctx, apk);
			}
		};
		ContextCompat.registerReceiver(ctx, done, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
				ContextCompat.RECEIVER_EXPORTED);
	}

	/** Back from the "install unknown apps" setting: install the update that was waiting for it. */
	private static void resumePendingInstall(Context ctx, SharedPreferences p) {
		long id = p.getLong("pending", -1);
		if (id < 0) return;
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) return;
		p.edit().remove("pending").apply();
		DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
		Uri apk = dm.getUriForDownloadedFile(id);
		if (apk != null) install(ctx, apk);
	}

	private static void install(Context ctx, Uri apk) {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
			// One-time permission: let cyberNAV install its own updates, then open the download again.
			Toast.makeText(ctx, "ALLOW CYBERNAV TO INSTALL UPDATES, THEN COME BACK",
					Toast.LENGTH_LONG).show();
			Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
			s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
			ctx.startActivity(s);
			return;
		}
		ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("pending").apply();
		Intent i = new Intent(Intent.ACTION_VIEW);
		i.setDataAndType(apk, "application/vnd.android.package-archive");
		i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
		ctx.startActivity(i);
	}
}
