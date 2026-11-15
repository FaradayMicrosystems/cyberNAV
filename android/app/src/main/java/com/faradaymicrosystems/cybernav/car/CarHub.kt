package com.faradaymicrosystems.cybernav.car

import android.Manifest
import android.annotation.SuppressLint
import android.app.Presentation
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.net.Uri
import android.webkit.WebView
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.ScreenManager
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import androidx.car.app.navigation.NavigationManager
import androidx.car.app.navigation.NavigationManagerCallback
import androidx.car.app.navigation.model.Trip
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.faradaymicrosystems.cybernav.WebHost
import org.json.JSONObject

/**
 * Glue between the Android Auto host and the cyberNAV web core.
 *
 * - The map surface the host gives us is turned into a VirtualDisplay; a Presentation on that
 *   display hosts a WebView running the web app in car mode, so the car map is drawn by the
 *   same Phosphor HUD renderer as the phone (3D wireframe buildings included).
 * - The web app posts its template model (JSON) through the bridge; screens turn it into
 *   Car App Library templates and NavigationManager trip updates.
 * - Host actions (buttons, search text, pan and zoom) are sent back as JavaScript calls.
 */
class CarHub(val carContext: CarContext, lifecycle: Lifecycle) : DefaultLifecycleObserver {
    lateinit var root: NavScreen
    var model: JSONObject = JSONObject("{\"type\":\"navigation\"}")
        private set

    private var display: VirtualDisplay? = null
    private var presentation: Presentation? = null
    private var web: WebView? = null
    private var bridge: WebHost.Bridge? = null
    private val pending = mutableListOf<String>()
    private var navigating = false
    private val nav: NavigationManager = carContext.getCarService(NavigationManager::class.java)
    private val screens: ScreenManager get() = carContext.getCarService(ScreenManager::class.java)
    private var density = 1f

    private val surfaceCallback = object : SurfaceCallback {
        override fun onSurfaceAvailable(container: SurfaceContainer) { attach(container) }
        override fun onSurfaceDestroyed(container: SurfaceContainer) { detach() }
        override fun onStableAreaChanged(area: Rect) { sendArea(area) }
        override fun onVisibleAreaChanged(area: Rect) { sendArea(area) }
        override fun onScroll(distanceX: Float, distanceY: Float) { js("cybernav.pan(${-distanceX / density},${-distanceY / density})") }
        override fun onScale(focusX: Float, focusY: Float, scaleFactor: Float) {
            // scaleFactor < 0 is the host's "double tap to zoom in" signal.
            val f = if (scaleFactor < 0) 2f else scaleFactor
            js("cybernav.zoom($f)")
        }
    }

    private var lastWidth = 0
    private var lastHeight = 0

    init {
        lifecycle.addObserver(this)
        nav.setNavigationManagerCallback(object : NavigationManagerCallback {
            override fun onStopNavigation() { js("cybernav.action('end')") }
            override fun onAutoDriveEnabled() { js("cybernav.action('demo')") }
        })
        carContext.getCarService(AppManager::class.java).setSurfaceCallback(surfaceCallback)
    }


    private fun sendArea(a: Rect) {
        if (lastWidth == 0) return
        val l = a.left / density; val t = a.top / density
        val r = (lastWidth - a.right) / density; val b = (lastHeight - a.bottom) / density
        js("cybernav.stableArea($l,$t,$r,$b)")
    }

    @SuppressLint("WrongConstant")
    private fun attach(c: SurfaceContainer) {
        val surface = c.surface ?: return
        detach()
        lastWidth = c.width; lastHeight = c.height
        density = c.dpi / 160f
        val dm = carContext.getSystemService(DisplayManager::class.java)
        display = dm.createVirtualDisplay("cybernav-car", c.width, c.height, c.dpi, surface,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY)
        val vd = display?.display ?: return
        val p = Presentation(carContext, vd)
        val b = object : WebHost.Bridge(carContext, "car") {
            override fun onState(json: String) { onModel(json) }
        }
        val w = WebHost.create(p.context, b)
        p.setContentView(w)
        p.show()
        presentation = p; web = w; bridge = b
        w.loadUrl(WebHost.url("car", hasLocation()))
        // Flush commands that arrived before the page loaded (e.g. a navigation intent).
        w.postDelayed({ pending.toList().forEach { js(it) }; pending.clear() }, 2500)
    }

    private fun detach() {
        presentation?.dismiss(); presentation = null
        web?.destroy(); web = null
        bridge?.shutdown(); bridge = null
        display?.release(); display = null
    }

    override fun onDestroy(owner: LifecycleOwner) {
        if (navigating) nav.navigationEnded()
        detach()
    }

    private fun hasLocation() = ContextCompat.checkSelfPermission(carContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun js(code: String) {
        val w = web
        if (w == null) { pending += code; return }
        w.post { w.evaluateJavascript("if (window.cybernav && cybernav.action) { $code }", null) }
    }

    fun action(id: String, arg: String? = null) {
        val a = if (arg == null) "" else ", " + JSONObject.quote(arg)
        js("cybernav.action(${JSONObject.quote(id)}$a)")
    }

    fun mapAction(id: String) = js("cybernav.mapAction(${JSONObject.quote(id)})")

    /** A new template model from the web app. */
    private fun onModel(json: String) {
        val m = try { JSONObject(json) } catch (e: Exception) { return }
        model = m
        val type = m.optString("type")
        val top = screens.top
        when (type) {
            "search" -> if (top !is SearchScreen) screens.push(SearchScreen(carContext, this))
            "routePreview" -> {
                if (top is SearchScreen) screens.pop()
                if (screens.top !is PreviewScreen) screens.push(PreviewScreen(carContext, this))
            }
            else -> if (top !is NavScreen) screens.popToRoot()
        }
        updateTrip(m)
        screens.top.invalidate()
    }

    private fun updateTrip(m: JSONObject) {
        val routing = m.optJSONObject("routingInfo")
        val active = routing != null
        if (active && !navigating) { nav.navigationStarted(); navigating = true }
        if (!active && navigating) { nav.navigationEnded(); navigating = false }
        if (!active) return
        try {
            val trip = Trip.Builder()
            if (routing!!.optBoolean("loading")) trip.setLoading(true)
            else {
                val step = Templates.step(carContext, routing)
                val est = Templates.estimate(m.getJSONObject("travelEstimate"))
                trip.addStep(step, est).addDestination(Templates.destination(m), est)
                    .setCurrentRoad(routing.optString("road"))
            }
            nav.updateTrip(trip.build())
        } catch (e: Exception) { /* cluster data is best effort */ }
    }

    /** geo:lat,lon or geo:0,0?q=lat,lon(label) or geo:0,0?q=address from Assistant / other apps. */
    fun handleIntent(intent: Intent) {
        if (intent.action != CarContext.ACTION_NAVIGATE) return
        val uri: Uri = intent.data ?: return
        val ssp = uri.schemeSpecificPart ?: return
        val q = uri.getQueryParameter("q")
        val coords = Regex("(-?\\d+\\.?\\d*)\\s*,\\s*(-?\\d+\\.?\\d*)")
        val m = coords.find(q ?: "") ?: coords.find(ssp.substringBefore("?"))
        val text = if (m != null && (m.groupValues[1].toDouble() != 0.0 || m.groupValues[2].toDouble() != 0.0)) "${m.groupValues[1]}, ${m.groupValues[2]}" else (q ?: return)
        CarToast.makeText(carContext, "Searching $text", CarToast.LENGTH_SHORT).show()
        action("search")
        action("searchText", text)
    }
}
