package com.faradaymicrosystems.cybernav.car

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import androidx.car.app.CarContext
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.DateTimeWithZone
import androidx.car.app.model.Distance
import androidx.car.app.navigation.model.Destination
import androidx.car.app.navigation.model.Maneuver
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import androidx.core.graphics.drawable.IconCompat
import com.faradaymicrosystems.cybernav.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/** Builders that turn the web app's template model into Car App Library objects. */
object Templates {
    val PHOSPHOR: CarColor = CarColor.createCustom(Color.parseColor("#4E7A2C"), Color.parseColor("#B8FF7A"))
    /** Dark phosphor-tinted background for the host's routing card (host text stays readable). */
    val CARD: CarColor = CarColor.createCustom(Color.parseColor("#12301A"), Color.parseColor("#12301A"))

    fun distance(meters: Double): Distance =
        if (meters >= 1000) Distance.create(meters / 1000.0, Distance.UNIT_KILOMETERS_P1)
        else Distance.create(maxOf(10.0, Math.round(meters / 10.0) * 10.0), Distance.UNIT_METERS)

    fun estimate(e: JSONObject): TravelEstimate {
        val arrival = DateTimeWithZone.create(e.optLong("arrivalEpochMs", System.currentTimeMillis()), TimeZone.getDefault())
        return TravelEstimate.Builder(distance(e.optDouble("remainingMeters", 0.0)), arrival)
            .setRemainingTimeSeconds(e.optLong("remainingSeconds", 0))
            .setRemainingTimeColor(PHOSPHOR)
            .build()
    }

    fun destination(m: JSONObject): Destination = Destination.Builder().setName(m.optString("destination", "Destination").ifEmpty { "Destination" }).build()

    private val TYPES = mapOf(
        "DEPART" to Maneuver.TYPE_DEPART, "STRAIGHT" to Maneuver.TYPE_STRAIGHT,
        "KEEP_LEFT" to Maneuver.TYPE_KEEP_LEFT, "KEEP_RIGHT" to Maneuver.TYPE_KEEP_RIGHT,
        "TURN_SLIGHT_LEFT" to Maneuver.TYPE_TURN_SLIGHT_LEFT, "TURN_SLIGHT_RIGHT" to Maneuver.TYPE_TURN_SLIGHT_RIGHT,
        "TURN_NORMAL_LEFT" to Maneuver.TYPE_TURN_NORMAL_LEFT, "TURN_NORMAL_RIGHT" to Maneuver.TYPE_TURN_NORMAL_RIGHT,
        "TURN_SHARP_LEFT" to Maneuver.TYPE_TURN_SHARP_LEFT, "TURN_SHARP_RIGHT" to Maneuver.TYPE_TURN_SHARP_RIGHT,
        "U_TURN_LEFT" to Maneuver.TYPE_U_TURN_LEFT,
        "ROUNDABOUT_ENTER_AND_EXIT_CCW" to Maneuver.TYPE_ROUNDABOUT_ENTER_AND_EXIT_CCW,
        "DESTINATION" to Maneuver.TYPE_DESTINATION, "DESTINATION_LEFT" to Maneuver.TYPE_DESTINATION_LEFT,
        "DESTINATION_RIGHT" to Maneuver.TYPE_DESTINATION_RIGHT,
    )

    fun step(ctx: CarContext, r: JSONObject): Step {
        val man = r.getJSONObject("maneuver")
        val name = man.optString("type", "STRAIGHT")
        val b = Maneuver.Builder(TYPES[name] ?: Maneuver.TYPE_STRAIGHT).setIcon(maneuverIcon(name))
        if (name.startsWith("ROUNDABOUT")) b.setRoundaboutExitNumber(maxOf(1, man.optInt("roundaboutExit", 1)))
        return Step.Builder(r.optString("cue", "")).setManeuver(b.build()).setRoad(r.optString("road", "")).build()
    }

    private val ICONS = mapOf(
        "search" to R.drawable.ic_search, "demo" to R.drawable.ic_play, "mute" to R.drawable.ic_volume,
        "unmute" to R.drawable.ic_volume_off, "cancel" to R.drawable.ic_close, "end" to R.drawable.ic_close, "done" to R.drawable.ic_close,
    )

    /**
     * Action strip from the model. Android Auto allows only one custom-titled action in a
     * navigation action strip, so the first action keeps its title and the rest are icons.
     */
    fun actionStrip(ctx: CarContext, arr: JSONArray?, hub: CarHub): ActionStrip {
        val s = ActionStrip.Builder()
        val n = minOf(arr?.length() ?: 0, 4)
        for (i in 0 until n) {
            val a = arr!!.getJSONObject(i)
            val id = a.optString("id")
            val b = Action.Builder().setOnClickListener { hub.action(id) }
            if (i == 0) b.setTitle(a.optString("title"))
            else {
                val key = if (id == "mute" && a.optString("title") == "Unmute") "unmute" else id
                b.setIcon(CarIcon.Builder(IconCompat.createWithResource(ctx, ICONS[key] ?: R.drawable.ic_close)).build())
            }
            s.addAction(b.build())
        }
        if (n == 0) s.addAction(Action.Builder().setTitle("Search").setOnClickListener { hub.action("search") }.build())
        return s.build()
    }

    fun iconAction(ctx: CarContext, res: Int, onClick: () -> Unit): Action =
        Action.Builder().setIcon(CarIcon.Builder(IconCompat.createWithResource(ctx, res)).build()).setOnClickListener(onClick).build()

    /** Map buttons: pan mode plus zoom and recenter, drawn by the host as round icon buttons. */
    fun mapActionStrip(ctx: CarContext, hub: CarHub): ActionStrip = ActionStrip.Builder()
        .addAction(Action.PAN)
        .addAction(iconAction(ctx, R.drawable.ic_zoom_in) { hub.mapAction("zoomIn") })
        .addAction(iconAction(ctx, R.drawable.ic_zoom_out) { hub.mapAction("zoomOut") })
        .addAction(iconAction(ctx, R.drawable.ic_recenter) { hub.mapAction("recenter") })
        .build()


    private val iconCache = HashMap<String, CarIcon>()

    /** Wireframe turn arrows in phosphor green, drawn once per maneuver type. */
    fun maneuverIcon(type: String): CarIcon = iconCache.getOrPut(type) {
        val size = 128
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#B8FF7A"); style = Paint.Style.STROKE; strokeWidth = 9f
            strokeJoin = Paint.Join.MITER; strokeCap = Paint.Cap.SQUARE
        }
        val angle = when (type) {
            "TURN_SLIGHT_LEFT", "KEEP_LEFT" -> -40f; "TURN_SLIGHT_RIGHT", "KEEP_RIGHT" -> 40f
            "TURN_NORMAL_LEFT" -> -90f; "TURN_NORMAL_RIGHT" -> 90f
            "TURN_SHARP_LEFT" -> -135f; "TURN_SHARP_RIGHT" -> 135f
            else -> 0f
        }
        when {
            type.startsWith("DESTINATION") -> {
                val path = Path().apply { moveTo(64f, 24f); lineTo(100f, 64f); lineTo(64f, 104f); lineTo(28f, 64f); close() }
                c.drawPath(path, p)
            }
            type.startsWith("ROUNDABOUT") -> {
                c.drawCircle(64f, 58f, 22f, p)
                c.drawLine(64f, 112f, 64f, 80f, p)
                c.drawLine(80f, 42f, 106f, 18f, p)
            }
            type == "U_TURN_LEFT" -> {
                val path = Path().apply { moveTo(88f, 112f); lineTo(88f, 52f); arcTo(40f, 28f, 88f, 76f, 0f, -180f, false); lineTo(40f, 92f) }
                c.drawPath(path, p)
                c.drawLine(40f, 96f, 24f, 78f, p); c.drawLine(40f, 96f, 56f, 78f, p)
            }
            else -> {
                // Stem from the bottom, then a chevron arrow rotated toward the turn.
                c.drawLine(64f, 116f, 64f, 70f, p)
                c.save(); c.rotate(angle, 64f, 70f)
                val path = Path().apply { moveTo(64f, 70f); lineTo(64f, 22f); moveTo(44f, 44f); lineTo(64f, 20f); lineTo(84f, 44f) }
                c.drawPath(path, p); c.restore()
            }
        }
        CarIcon.Builder(IconCompat.createWithBitmap(bmp)).build()
    }
}
