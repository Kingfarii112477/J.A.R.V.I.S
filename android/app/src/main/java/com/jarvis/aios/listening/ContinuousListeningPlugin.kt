package com.jarvis.aios.listening

import android.Manifest
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * The bridge between [ContinuousListeningService] and the web layer's
 * continuous-listening provider (src/lib/voice/continuous/native.ts).
 *
 * Strictly a transport: it starts/stops the service, relays real native
 * events to JS, and answers state queries. It contains no wake-word
 * logic of its own and no reasoning — the service owns the microphone,
 * the web layer owns the conversation.
 *
 * The RECORD_AUDIO request lives here rather than in
 * DeviceCapabilityPlugin because this is a genuinely different consumer
 * of the permission: DeviceCapability deliberately delegates the
 * WebView's own getUserMedia prompt to Capacitor's BridgeWebChromeClient
 * (see MainActivity.kt), whereas a *foreground service* needs the
 * permission held by the app process before it can start at all.
 */
@CapacitorPlugin(
    name = "ContinuousListening",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = ContinuousListeningPlugin.MIC_ALIAS),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = ContinuousListeningPlugin.NOTIFICATIONS_ALIAS),
    ],
)
class ContinuousListeningPlugin : Plugin(), ContinuousListeningService.Listener {

    companion object {
        const val MIC_ALIAS = "microphone"
        const val NOTIFICATIONS_ALIAS = "notifications"

        /** Event names mirrored exactly in the web layer's native
         * provider — keep the two lists in sync. */
        private const val EVENT_WAKE = "wakeWordDetected"
        private const val EVENT_STATE = "listeningStateChanged"
        private const val EVENT_ERROR = "listeningError"
    }

    override fun load() {
        super.load()
        // Attach as the service's listener. The service may already be
        // running (it survives WebView recreation by design), in which
        // case this simply reconnects the pipe.
        ContinuousListeningService.listener = this
    }

    override fun handleOnDestroy() {
        // Detach without stopping the service: continuous listening is
        // supposed to outlive the WebView.
        if (ContinuousListeningService.listener === this) {
            ContinuousListeningService.listener = null
        }
        super.handleOnDestroy()
    }

    // ---- Service.Listener → JS ---------------------------------------------

    override fun onWakeWordDetected() {
        notifyListeners(EVENT_WAKE, JSObject())
    }

    override fun onStateChanged(snapshot: ListeningSnapshot) {
        notifyListeners(EVENT_STATE, snapshot.toJs())
    }

    override fun onError(message: String) {
        notifyListeners(EVENT_ERROR, JSObject().put("message", message))
    }

    // ---- JS → native --------------------------------------------------------

    /** Whether this build can do wake-word detection at all, so the UI
     * can be honest before the user toggles anything on. */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("available", ContinuousListeningService.isConfigured())
                .put("engineId", if (ContinuousListeningService.isConfigured()) "porcupine" else "unavailable")
                .put(
                    "reason",
                    if (ContinuousListeningService.isConfigured()) null
                    else "No Picovoice AccessKey was configured for this build, so on-device wake-word detection is unavailable.",
                )
        )
    }

    /** Current native state — the resync path after a WebView reload. */
    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(ContinuousListeningService.snapshot.toJs())
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
            // Save the call and request live — never start a mic service
            // on an ungranted permission.
            requestPermissionForAlias(MIC_ALIAS, call, "micPermissionCallback")
            return
        }
        launchService(call)
    }

    @PermissionCallback
    private fun micPermissionCallback(call: PluginCall) {
        if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
            call.resolve(
                JSObject()
                    .put("started", false)
                    .put("reason", "Microphone permission is required for hands-free listening and was not granted."),
            )
            return
        }
        launchService(call)
    }

    private fun launchService(call: PluginCall) {
        val sensitivity = call.getFloat("sensitivity") ?: 0.5f
        val batterySaver = call.getBoolean("batterySaver") ?: true
        val intent = Intent(context, ContinuousListeningService::class.java).apply {
            action = ContinuousListeningService.ACTION_START
            putExtra(ContinuousListeningService.EXTRA_SENSITIVITY, sensitivity)
            putExtra(ContinuousListeningService.EXTRA_BATTERY_SAVER, batterySaver)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            call.resolve(JSObject().put("started", true))
        } catch (e: Exception) {
            // Android 12+ can refuse a foreground-service start from the
            // background outright. Report it rather than claiming success.
            call.resolve(
                JSObject()
                    .put("started", false)
                    .put("reason", "Android refused to start the listening service: ${e.message ?: "unknown error"}"),
            )
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        send(ContinuousListeningService.ACTION_STOP)
        call.resolve()
    }

    /**
     * Called by the web layer once a full conversation turn (including
     * any follow-up window) is finished and it has released the
     * microphone — the service then re-arms wake-word detection.
     */
    @PluginMethod
    fun resumeStandby(call: PluginCall) {
        send(ContinuousListeningService.ACTION_RESUME_STANDBY)
        call.resolve()
    }

    /**
     * Called by the web layer immediately before it starts capturing, so
     * the native engine releases the microphone first. Normally the
     * service does this itself on wake; this exists for the manual
     * "tap to talk while standby is active" path.
     */
    @PluginMethod
    fun handOff(call: PluginCall) {
        send(ContinuousListeningService.ACTION_HANDOFF)
        call.resolve()
    }

    private fun send(action: String) {
        val intent = Intent(context, ContinuousListeningService::class.java).setAction(action)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}

private fun ListeningSnapshot.toJs(): JSObject = JSObject()
    .put("state", state.name)
    .put("suspendReason", suspendReason.name)
    .put("engineId", engineId)
    .put("available", available)
    .put("detail", detail)
