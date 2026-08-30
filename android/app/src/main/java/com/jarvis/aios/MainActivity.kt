package com.jarvis.aios

import com.getcapacitor.BridgeActivity
import com.jarvis.aios.credentials.SecureCredentialsPlugin
import com.jarvis.aios.listening.ContinuousListeningPlugin

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
        // Hands-free continuous listening. The service this plugin talks
        // to deliberately outlives the WebView, so the plugin re-attaches
        // to the already-running service on every Activity recreation
        // rather than restarting listening from scratch.
        registerPlugin(ContinuousListeningPlugin::class.java)
        // Standalone build: there is no server holding provider secrets,
        // so the user's own API keys are stored encrypted on-device here.
        registerPlugin(SecureCredentialsPlugin::class.java)
    }
}
