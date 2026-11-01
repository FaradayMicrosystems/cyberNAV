package com.faradaymicrosystems.cybernav

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.util.Locale

/**
 * Hosts the shared cyberNAV web app (bundled in assets/web) in a WebView.
 * The same app runs the phone UI (mode=phone) and the Android Auto map surface (mode=car).
 */
object WebHost {
    const val ORIGIN = "https://appassets.androidplatform.net"

    fun url(mode: String, live: Boolean): String =
        "$ORIGIN/assets/web/index.html?mode=$mode&noboot=${if (mode == "car") "1" else "0"}" + if (live) "&live=1" else ""

    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, bridge: Bridge): WebView {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
        return WebView(context).apply {
            setBackgroundColor(Color.parseColor("#020503"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setGeolocationEnabled(true)
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(bridge, "CyberNavHost")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    // The app itself already holds the Android location permission.
                    callback.invoke(origin, true, false)
                }
            }
        }
    }

    /** JavaScript bridge: the web app calls these as window.CyberNavHost.*. */
    open class Bridge(context: Context, private val mode: String) {
        private val main = Handler(Looper.getMainLooper())
        private var ttsReady = false
        private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) tts.language = Locale.getDefault()
        }

        @JavascriptInterface fun mode(): String = mode

        @JavascriptInterface fun speak(text: String) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cybernav")
        }

        /** Latest Android Auto template model as JSON; the car side overrides this. */
        @JavascriptInterface fun postState(json: String) {
            main.post { onState(json) }
        }

        open fun onState(json: String) {}

        fun shutdown() { tts.shutdown() }
    }
}
