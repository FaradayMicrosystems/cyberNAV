package net.osmand.plus.cybernav;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import net.osmand.IndexConstants;
import net.osmand.plus.OsmandApplication;
import net.osmand.plus.settings.backend.ApplicationMode;
import net.osmand.plus.settings.backend.OsmandSettings;
import net.osmand.plus.settings.backend.preferences.OsmandPreference;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * A natural-sounding navigation voice.
 *
 * - Speaks with the phone's text-to-speech voice at normal pitch and speed.
 * - If the phone's default speech engine is one of the old robotic ones (eSpeak, Pico) and Google
 *   Speech Services is installed, that is used instead.
 * - Picks the best-quality installed voice for the language when the engine's default one is a
 *   lower-quality voice. Voices that need the internet are skipped, so prompts never go silent
 *   or lag in a dead zone. A voice of equal or better quality chosen in Android's
 *   text-to-speech settings is kept.
 * - Once per install, a recorded (pre-made audio) voice pack is switched to the phone's voice.
 *   Any voice can still be picked under Settings > Navigation > Voice prompts > Language.
 */
public final class CyberVoice {
	private static final String GOOGLE_TTS = "com.google.android.tts";
	private static final Set<String> ROBOTIC_ENGINES = new HashSet<>(Arrays.asList(
			"com.svox.pico", "com.reecedunn.espeak", "com.googlecode.eyesfree.espeak", "com.redzoc.ramees.tts.espeak"));

	private CyberVoice() {
	}

	/** Same as new TextToSpeech(context, listener), on a natural-sounding engine. */
	public static TextToSpeech create(Context context, TextToSpeech.OnInitListener listener) {
		return new TextToSpeech(context, listener, engine(context));
	}

	/** The engine to use, or null for the phone's default engine. */
	static String engine(Context context) {
		try {
			String def = Settings.Secure.getString(context.getContentResolver(), "tts_default_synth");
			if (def != null && ROBOTIC_ENGINES.contains(def) && installed(context, GOOGLE_TTS)) {
				return GOOGLE_TTS;
			}
		} catch (RuntimeException e) {
			// fall back to the default engine
		}
		return null;
	}

	private static boolean installed(Context context, String enginePackage) {
		List<ResolveInfo> services = context.getPackageManager()
				.queryIntentServices(new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0);
		for (ResolveInfo s : services) {
			if (s.serviceInfo != null && enginePackage.equals(s.serviceInfo.packageName)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Called once the engine is ready and its language is set: normal pitch, normal speed (unless
	 * the user set a speech rate), best installed voice for the language.
	 */
	public static void tune(TextToSpeech tts, Locale locale, float speechRate) {
		if (tts == null) {
			return;
		}
		try {
			tts.setPitch(1.0f);
			tts.setSpeechRate(speechRate > 0 ? speechRate : 1.0f);
			if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || locale == null) {
				return;
			}
			Set<Voice> voices = tts.getVoices();
			if (voices == null) {
				return;
			}
			Voice current = tts.getVoice();
			Voice best = null;
			int bestScore = Integer.MIN_VALUE;
			for (Voice v : voices) {
				int s = score(v, locale);
				if (s > bestScore) {
					best = v;
					bestScore = s;
				}
			}
			if (best != null && bestScore > Integer.MIN_VALUE
					&& (current == null || score(current, locale) < bestScore - 10)) { // only a clearly better voice
				tts.setVoice(best);
			}
		} catch (RuntimeException e) {
			// keep whatever the engine chose
		}
	}

	/** Higher is better; MIN_VALUE = unusable for this language or offline use. */
	private static int score(Voice v, Locale want) {
		Locale l = v.getLocale();
		if (l == null || !l.getLanguage().equals(want.getLanguage())) {
			return Integer.MIN_VALUE;
		}
		Set<String> features = v.getFeatures();
		if (v.isNetworkConnectionRequired()
				|| (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) {
			return Integer.MIN_VALUE;
		}
		int s = v.getQuality(); // 100 very low ... 500 very high
		if (!want.getCountry().isEmpty() && want.getCountry().equals(l.getCountry())) {
			s += 5; // same accent as the language setting, at equal quality
		}
		if (v.getLatency() <= Voice.LATENCY_NORMAL) {
			s += 1;
		}
		return s;
	}

	/** Once per install: a recorded voice pack becomes the phone's natural text-to-speech voice. */
	public static void migrate(OsmandApplication app) {
		SharedPreferences p = app.getSharedPreferences("cybernav_migrate", Context.MODE_PRIVATE);
		if (p.getBoolean("v12_natural_voice", false)) {
			return;
		}
		try {
			OsmandPreference<String> pref = app.getSettings().VOICE_PROVIDER;
			for (ApplicationMode mode : ApplicationMode.allPossibleValues()) {
				if (!pref.isSetForMode(mode)) {
					continue; // already on the default (the phone's voice)
				}
				String old = pref.getModeValue(mode);
				if (old == null || old.isEmpty() || OsmandSettings.VOICE_PROVIDER_NOT_USE.equals(old)
						|| old.endsWith(IndexConstants.VOICE_PROVIDER_SUFFIX)) {
					continue; // muted on purpose, or already a text-to-speech voice
				}
				pref.resetModeToDefault(mode);
				String now = pref.getModeValue(mode);
				if (now == null || !now.endsWith(IndexConstants.VOICE_PROVIDER_SUFFIX)) {
					pref.setModeValue(mode, old); // no phone voice for this language: keep the recording
				}
			}
			p.edit().putBoolean("v12_natural_voice", true).apply();
		} catch (RuntimeException e) {
			// try again next start
		}
	}
}
