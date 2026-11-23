package com.faradaymicrosystems.cybernav.car

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/** Entry point Android Auto binds to. */
class CyberNavCarAppService : CarAppService() {
    // Prototype: accept any host so the app works on the Desktop Head Unit and sideloaded
    // installs. A store build must restrict this to the known Android Auto host signatures.
    override fun createHostValidator(): HostValidator = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(): Session = CyberNavSession()
}

class CyberNavSession : Session() {
    private lateinit var hub: CarHub

    override fun onCreateScreen(intent: Intent): Screen {
        hub = CarHub(carContext, lifecycle)
        val root = NavScreen(carContext, hub)
        hub.root = root
        hub.handleIntent(intent)
        return root
    }

    override fun onNewIntent(intent: Intent) { hub.handleIntent(intent) }
}
