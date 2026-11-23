package net.osmand.plus.cybernav;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

/**
 * The cyberNAV CRT look on top of the map screen, after the "Unit 01 · CyberNav · P1 green" concept
 * screen: Share Tech Mono for the app's text, and a see-through overlay with scanlines, a dark
 * vignette and phosphor corner brackets. The overlay never takes touches.
 */
public final class CyberHud {
	private static final String FONT_ASSET = "fonts/cybernav_mono.ttf"; // Share Tech Mono (OFL 1.1)
	private static final String TAG = "cybernav_crt";
	private static Typeface font;

	private CyberHud() {
	}

	/** Loads the HUD font once, from OsmandApplication.onCreate. */
	public static void init(Context app) {
		try {
			font = Typeface.createFromAsset(app.getAssets(), FONT_ASSET);
		} catch (RuntimeException e) {
			font = null; // missing font: OsmAnd's default font is used
		}
	}

	/** The typeface OsmAnd's FontCache builds its normal and medium fonts from; null = system font. */
	public static Typeface font() {
		return font;
	}

	/** Redraws the CRT brackets after a theme switch. */
	static void refresh(Activity activity) {
		ViewGroup content = activity.findViewById(android.R.id.content);
		View overlay = content != null ? content.findViewWithTag(TAG) : null;
		if (overlay != null) {
			overlay.invalidate();
		}
	}

	/** Puts the CRT overlay over the map screen once (from MapActivity.onResume). */
	public static void attach(Activity activity) {
		ViewGroup content = activity.findViewById(android.R.id.content);
		if (content == null || content.findViewWithTag(TAG) != null) {
			return;
		}
		View overlay = new CrtOverlay(activity);
		overlay.setTag(TAG);
		content.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
	}

	private static final class CrtOverlay extends View {
		private final Paint scan = new Paint();
		private final Paint vignette = new Paint();
		private final Paint bracket = new Paint(Paint.ANTI_ALIAS_FLAG);
		private final float dp;

		CrtOverlay(Context context) {
			super(context);
			dp = context.getResources().getDisplayMetrics().density;
			setClickable(false);
			setFocusable(false);
			setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
			setWillNotDraw(false);
			scan.setColor(Color.argb(22, 0, 0, 0)); // lighter than the HUD token (18%) so the night map stays bright (v0.0.23)
			scan.setStrokeWidth(Math.max(1f, dp * 0.7f));
			bracket.setStyle(Paint.Style.STROKE);
			bracket.setStrokeWidth(2.2f * dp);
			setLayerType(LAYER_TYPE_SOFTWARE, null); // the bracket glow needs a software layer
		}

		@Override
		public boolean onTouchEvent(android.view.MotionEvent event) {
			return false;
		}

		@Override
		protected void onSizeChanged(int w, int h, int oldw, int oldh) {
			float r = (float) Math.hypot(w, h) / 2f;
			vignette.setShader(new RadialGradient(w / 2f, h / 2f, r,
					new int[] {Color.TRANSPARENT, Color.TRANSPARENT, Color.argb(60, 0, 0, 0)},
					new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
		}

		@Override
		protected void onDraw(Canvas canvas) {
			int w = getWidth(), h = getHeight();
			float step = 3 * dp; // one dark line every 3 dp, like the concept screen's 1 px in 3
			for (float y = 0; y < h; y += step) {
				canvas.drawLine(0, y, w, y, scan);
			}
			canvas.drawRect(0, 0, w, h, vignette);
			int ink = CyberTheme.ink(getContext()); // the phosphor theme's colour
			bracket.setColor(ink);
			bracket.setAlpha(255);
			bracket.setShadowLayer(4 * dp, 0, 0, ink);
			float m = 16 * dp, l = 26 * dp;
			float[][] corners = {{m, m, 1, 1}, {w - m, m, -1, 1}, {m, h - m, 1, -1}, {w - m, h - m, -1, -1}};
			for (float[] c : corners) {
				canvas.drawLine(c[0], c[1] + c[3] * l, c[0], c[1], bracket);
				canvas.drawLine(c[0], c[1], c[0] + c[2] * l, c[1], bracket);
			}
		}
	}
}
