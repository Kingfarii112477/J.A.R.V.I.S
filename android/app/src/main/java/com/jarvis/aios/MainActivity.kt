package com.jarvis.aios

import com.getcapacitor.BridgeActivity

/**
 * No WebChromeClient / onPermissionRequest override lives here on
 * purpose: Capacitor's own Bridge already installs BridgeWebChromeClient
 * (see Bridge.java's webView.setWebChromeClient(...) call inside
 * super.onCreate() below), whose onPermissionRequest() already does
 * exactly what Phase 6's "native mic bridge" needs — when the WebView's
 * JS calls getUserMedia({audio:true}) (the existing, unmodified
 * src/lib/voice/stt/browser.ts requestMicrophonePermission(), the SAME
 * code path chat/voice already use on the web), it requests the
 * RECORD_AUDIO runtime permission live and only grants the WebView's
 * media request once the user actually approves it — never silently.
 * Duplicating that here would just be a second, competing permission
 * path for the same one capability.
 */
class MainActivity : BridgeActivity() {
    init {
        // Must run before super.onCreate() per Capacitor's plugin
        // registration contract.
        registerPlugin(DeviceCapabilityPlugin::class.java)
    }
}
