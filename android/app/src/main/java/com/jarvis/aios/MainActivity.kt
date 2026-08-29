package com.jarvis.aios

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    init {
        // Must run before super.onCreate() per Capacitor's plugin
        // registration contract.
        registerPlugin(DeviceCapabilityPlugin::class.java)
    }
}
