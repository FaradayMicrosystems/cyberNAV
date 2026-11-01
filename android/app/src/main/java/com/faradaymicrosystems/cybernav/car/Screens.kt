package com.faradaymicrosystems.cybernav.car

import androidx.activity.OnBackPressedCallback
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.SearchTemplate
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MapController
import androidx.car.app.navigation.model.MapWithContentTemplate
import androidx.car.app.navigation.model.MessageInfo
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutePreviewNavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo

/** Root screen: free drive, active guidance and arrival, all on the NavigationTemplate. */
class NavScreen(ctx: CarContext, private val hub: CarHub) : Screen(ctx) {
    override fun onGetTemplate(): Template {
        val m = hub.model
        val b = NavigationTemplate.Builder()
            .setActionStrip(Templates.actionStrip(carContext, m.optJSONArray("actionStrip"), hub))
            .setMapActionStrip(Templates.mapActionStrip(carContext, hub))
            .setBackgroundColor(Templates.PHOSPHOR)
        val r = m.optJSONObject("routingInfo")
        val msg = m.optJSONObject("message")
        try {
            when {
                r != null && r.optBoolean("loading") -> b.setNavigationInfo(RoutingInfo.Builder().setLoading(true).build())
                r != null -> {
                    b.setNavigationInfo(RoutingInfo.Builder()
                        .setCurrentStep(Templates.step(carContext, r), Templates.distance(r.optDouble("distanceMeters", 0.0)))
                        .build())
                    m.optJSONObject("travelEstimate")?.let { b.setDestinationTravelEstimate(Templates.estimate(it)) }
                }
                msg != null -> b.setNavigationInfo(MessageInfo.Builder(msg.optString("title", "cyberNAV")).setText(msg.optString("text", "")).build())
            }
        } catch (e: Exception) {
            b.setNavigationInfo(MessageInfo.Builder("cyberNAV").setText(e.message ?: "Update failed").build())
        }
        return b.build()
    }
}

/** Destination search with the host keyboard; results come back from the web core. */
class SearchScreen(ctx: CarContext, private val hub: CarHub) : Screen(ctx) {
    init {
        ctx.onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { hub.action("back"); screenManager.pop() }
        })
    }

    override fun onGetTemplate(): Template {
        val m = hub.model
        val items = ItemList.Builder()
        val arr = m.optJSONArray("items")
        for (i in 0 until minOf(arr?.length() ?: 0, 6)) {
            val it = arr!!.getJSONObject(i)
            val id = it.optString("id")
            items.addItem(Row.Builder().setTitle(it.optString("title")).addText(it.optString("text")).setOnClickListener { hub.action(id) }.build())
        }
        if ((arr?.length() ?: 0) == 0) items.setNoItemsMessage(if (m.optString("query").isEmpty()) "Type a street or place" else "No results")
        val b = SearchTemplate.Builder(object : SearchTemplate.SearchCallback {
            override fun onSearchTextChanged(searchText: String) { hub.action("searchText", searchText) }
            override fun onSearchSubmitted(searchText: String) { hub.action("searchText", searchText) }
        })
            .setHeaderAction(Action.BACK)
            .setShowKeyboardByDefault(true)
            .setSearchHint(m.optString("hint", "Search places or streets"))
            .setInitialSearchText(m.optString("query"))
        if (m.optBoolean("loading")) b.setLoading(true) else b.setItemList(items.build())
        return b.build()
    }
}

/** Route choice: up to three routes on the map, with Start. */
class PreviewScreen(ctx: CarContext, private val hub: CarHub) : Screen(ctx) {
    init {
        ctx.onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { hub.action("cancel"); screenManager.popToRoot() }
        })
    }

    @Suppress("DEPRECATION")
    override fun onGetTemplate(): Template {
        val m = hub.model
        val arr = m.optJSONArray("items")
        val list = ItemList.Builder()
        val n = minOf(arr?.length() ?: 0, 6)
        for (i in 0 until n) {
            val it = arr!!.getJSONObject(i)
            list.addItem(Row.Builder().setTitle(it.optString("title")).addText(it.optString("text")).build())
        }
        list.setOnSelectedListener { index -> hub.action("route:$index") }
        list.setSelectedIndex(m.optInt("selected", 0).coerceIn(0, maxOf(0, n - 1)))
        val title = m.optString("title", "Routes")
        val start = Action.Builder().setTitle("Start").setBackgroundColor(Templates.PHOSPHOR)
            .setOnClickListener { hub.action("start") }.build()
        val strip = ActionStrip.Builder().addAction(start)
            .addAction(Action.Builder().setTitle("Cancel").setOnClickListener { hub.action("cancel") }.build()).build()

        if (carContext.carAppApiLevel >= 7 && n > 0) {
            val content = ListTemplate.Builder()
                .setTitle(title)
                .setHeaderAction(Action.BACK)
                .setSingleList(list.build())
                .build()
            return MapWithContentTemplate.Builder()
                .setContentTemplate(content)
                .setActionStrip(strip)
                .setMapController(MapController.Builder().setMapActionStrip(Templates.mapActionStrip(carContext, hub)).build())
                .build()
        }
        val b = RoutePreviewNavigationTemplate.Builder()
            .setTitle(title)
            .setHeaderAction(Action.BACK)
            .setNavigateAction(start)
            .setMapActionStrip(Templates.mapActionStrip(carContext, hub))
        if (n > 0) b.setItemList(list.build()) else b.setLoading(true)
        return b.build()
    }
}
