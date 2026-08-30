package com.jarvis.aios.listening

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.jarvis.aios.MainActivity
import com.jarvis.aios.R
import com.jarvis.aios.wake.OpenWakeWordEngine
import com.jarvis.aios.wake.WakeWordEngine

/**
 * The foreground service that makes hands-free J.A.R.V.I.S real.
 *
 * WHAT THIS OWNS (and the web layer therefore doesn't):
 *  - the microphone during standby
 *  - the on-device wake-word engine lifecycle
 *  - audio focus, and yielding it correctly to calls/other apps
 *  - battery-aware suspension
 *  - the user-visible "listening" notification
 *  - surviving WebView/Activity recreation
 *
 * WHAT THIS DELIBERATELY DOES NOT OWN:
 *  - speech-to-text, language detection, reasoning, tools, or TTS. On
 *    wake it releases the microphone and hands off to the web layer,
 *    which runs the EXISTING Phase 3 ReasoningEngine + Phase 5 voice
 *    pipeline. There is exactly one brain in this app and it is not
 *    here.
 *
 * PRIVACY: during STANDBY the only consumer of microphone audio is the
 * local wake-word engine. Nothing is buffered, stored, or transmitted.
 * The service emits the *fact* of a detection and nothing else.
 *
 * PLATFORM HONESTY: on Android 14+ a microphone foreground service can
 * only be started while the app is visible, and the OS may stop it under
 * memory pressure or aggressive OEM battery policies. This service
 * reports its true state at all times rather than claiming to be
 * listening when the system has stopped it — see [snapshot].
 */
class ContinuousListeningService : Service() {

    companion object {
        private const val TAG = "JarvisListening"

        const val ACTION_START = "com.jarvis.aios.listening.START"
        const val ACTION_STOP = "com.jarvis.aios.listening.STOP"
        const val ACTION_RESUME_STANDBY = "com.jarvis.aios.listening.RESUME_STANDBY"
        const val ACTION_HANDOFF = "com.jarvis.aios.listening.HANDOFF"

        const val EXTRA_SENSITIVITY = "sensitivity"
        const val EXTRA_BATTERY_SAVER = "batterySaver"

        private const val CHANNEL_ID = "jarvis_listening"
        private const val NOTIFICATION_ID = 4711

        /** Below this battery percentage, standby listening suspends
         * itself when battery-saver behaviour is enabled. Continuous
         * mic work is cheap but not free; refusing to be the reason a
         * phone dies is the right default. */
        private const val BATTERY_LOW_PERCENT = 15

        /**
         * Bridge to the Capacitor plugin. Held statically because the
         * service outlives the WebView by design — the plugin attaches
         * on load and detaches on teardown, and the service keeps
         * running (and keeps its state) in between.
         */
        @Volatile
        var listener: Listener? = null

        /** Last known state, readable even with no listener attached —
         * this is what a freshly recreated WebView resyncs from. */
        @Volatile
        var snapshot: ListeningSnapshot = ListeningSnapshot(
            state = ListeningState.STOPPED,
            suspendReason = SuspendReason.NONE,
            engineId = "unknown",
            available = false,
            detail = null,
        )
            private set

        /**
         * openWakeWord's models ship inside the APK and need no account,
         * key, or network, so wake-word detection is always configured on
         * every build. Kept as a function (rather than inlining `true`)
         * because callers legitimately ask this question, and a future
         * engine swap could reintroduce a real condition here.
         */
        fun isConfigured(): Boolean = true
    }

    /** How the service talks to the web layer. Every callback is a
     * statement of something that actually happened natively. */
    interface Listener {
        fun onWakeWordDetected()
        fun onStateChanged(snapshot: ListeningSnapshot)
        fun onError(message: String)
    }

    private var engine: WakeWordEngine? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private var batterySaver = true
    private var sensitivity = 0.5f
    /** Minimum gap between accepted detections. One spoken "Hey JARVIS"
     * stays inside the classifier's ~3s context for dozens of consecutive
     * 80ms frames, so without this a single utterance fires repeatedly.
     * Mirrors VOICE_DEFAULTS.wakeWordDebounceMs on the web side. */
    private var wakeDebounceMs = 2000L
    private var registeredReceiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        createNotificationChannel()
        registerSystemReceivers()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopListening(ListeningState.STOPPED, SuspendReason.NONE, null)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_HANDOFF -> {
                // The wake phrase was handled and the web layer is about
                // to capture the actual command — release the mic so its
                // getUserMedia can acquire it. Android gives input to one
                // consumer at a time; this hand-off is what prevents the
                // two from fighting over the microphone.
                handOffMicrophone()
                return START_STICKY
            }
            ACTION_RESUME_STANDBY -> {
                resumeStandby()
                return START_STICKY
            }
            else -> {
                sensitivity = intent?.getFloatExtra(EXTRA_SENSITIVITY, sensitivity) ?: sensitivity
                batterySaver = intent?.getBooleanExtra(EXTRA_BATTERY_SAVER, batterySaver) ?: batterySaver
                // The permission is checked BEFORE going foreground, not
                // after. A microphone foreground service started without
                // RECORD_AUDIO throws on Android 14+, and a service started
                // via startForegroundService() that never reaches
                // startForeground() is killed by the system with
                // ForegroundServiceDidNotStartInTimeException — which the
                // app cannot catch. Attempting it first and discovering the
                // missing permission afterwards is therefore a guaranteed
                // process death, not a recoverable error.
                if (!hasMicPermission()) {
                    publish(
                        ListeningState.SUSPENDED,
                        SuspendReason.MICROPHONE_UNAVAILABLE,
                        "Microphone access hasn't been granted, so hands-free listening can't start.",
                    )
                    listener?.onError("Microphone access is needed for hands-free listening. Grant it in the app's permissions.")
                    stopSelf()
                    return START_NOT_STICKY
                }
                if (!startForegroundSafely()) {
                    // Stopping is not tidiness — it is what cancels the
                    // system's "must reach foreground" deadline. Leaving
                    // the service alive here is what kills the app.
                    stopSelf()
                    return START_NOT_STICKY
                }
                beginStandby()
            }
        }
        // START_STICKY: if Android kills us for memory, ask to be
        // recreated. This is the "service restart/recovery" requirement —
        // and on recreation we re-enter standby from scratch rather than
        // assuming stale state.
        return START_STICKY
    }

    override fun onDestroy() {
        stopListening(ListeningState.STOPPED, SuspendReason.NONE, null)
        engine?.release()
        engine = null
        registeredReceiver?.let {
            runCatching { unregisterReceiver(it) }
        }
        registeredReceiver = null
        super.onDestroy()
    }

    // ---- Standby lifecycle -------------------------------------------------

    private fun beginStandby() {
        if (!hasMicPermission()) {
            publish(ListeningState.SUSPENDED, SuspendReason.PERMISSION_DENIED, "Microphone permission has not been granted.")
            return
        }
        if (batterySaver && isBatteryCritical()) {
            publish(ListeningState.SUSPENDED, SuspendReason.BATTERY_LOW, "Standby listening paused — battery is critically low.")
            return
        }
        if (isCallActive()) {
            publish(ListeningState.SUSPENDED, SuspendReason.PHONE_CALL, "Standby listening paused during a call.")
            return
        }

        val active = engine ?: OpenWakeWordEngine
            .create(this, sensitivity, wakeDebounceMs)
            .also { engine = it }

        if (!active.isAvailable()) {
            // Honest terminal state: say wake word is unavailable rather
            // than pretending standby works.
            publish(
                ListeningState.UNAVAILABLE,
                SuspendReason.NONE,
                "Wake-word detection isn't available on this build (no Picovoice AccessKey configured).",
            )
            return
        }

        val started = active.start(
            onWake = { onWakeDetected() },
            onError = { message ->
                publish(ListeningState.SUSPENDED, SuspendReason.MICROPHONE_UNAVAILABLE, message)
                listener?.onError(message)
            },
        )
        if (started) {
            publish(ListeningState.STANDBY, SuspendReason.NONE, null)
        }
    }

    private fun onWakeDetected() {
        Log.i(TAG, "Wake word detected")
        // Release the mic immediately — the web layer needs it for the
        // real command capture, and holding it here would block that.
        handOffMicrophone()
        listener?.onWakeWordDetected()
    }

    private fun handOffMicrophone() {
        engine?.stop()
        publish(ListeningState.HANDED_OFF, SuspendReason.NONE, null)
    }

    /** Called by the web layer when a conversation turn (including any
     * follow-up window) has fully finished and the mic is free again. */
    private fun resumeStandby() {
        if (snapshotState() == ListeningState.STOPPED) return
        beginStandby()
    }

    private fun stopListening(state: ListeningState, reason: SuspendReason, detail: String?) {
        engine?.stop()
        abandonAudioFocus()
        publish(state, reason, detail)
    }

    // ---- Audio focus / interruptions ---------------------------------------

    /**
     * Audio focus is the correct, permission-free mechanism for
     * detecting phone calls and other apps taking over audio. Using it
     * (rather than READ_PHONE_STATE + a telephony callback) means this
     * feature needs no additional privacy-sensitive permission, which is
     * exactly the "do not request unnecessary permissions" requirement.
     */
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            -> {
                engine?.stop()
                val reason = if (isCallActive()) SuspendReason.PHONE_CALL else SuspendReason.AUDIO_FOCUS_LOST
                val detail = if (reason == SuspendReason.PHONE_CALL) {
                    "Standby listening paused during a call."
                } else {
                    "Standby listening paused — another app is using audio."
                }
                publish(ListeningState.SUSPENDED, reason, detail)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (snapshotState() == ListeningState.SUSPENDED) beginStandby()
            }
        }
    }

    private fun abandonAudioFocus() {
        val manager = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(focusListener)
        }
        focusRequest = null
    }

    private fun isCallActive(): Boolean {
        val mode = audioManager?.mode ?: return false
        return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
    }

    private fun isBatteryCritical(): Boolean {
        val manager = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return false
        val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val charging = manager.isCharging
        return !charging && level in 1 until BATTERY_LOW_PERCENT
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Battery, headset and call-state changes all feed the same
     * re-evaluation: whenever the environment changes, decide again
     * whether standby should be running. Registered at runtime (not in
     * the manifest) because these only matter while the service lives.
     */
    private fun registerSystemReceivers() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_BATTERY_LOW,
                    Intent.ACTION_POWER_DISCONNECTED,
                    -> if (batterySaver && isBatteryCritical() && snapshotState() == ListeningState.STANDBY) {
                        engine?.stop()
                        publish(ListeningState.SUSPENDED, SuspendReason.BATTERY_LOW, "Standby listening paused — battery is critically low.")
                    }
                    Intent.ACTION_BATTERY_OKAY,
                    Intent.ACTION_POWER_CONNECTED,
                    -> if (snapshotState() == ListeningState.SUSPENDED) beginStandby()
                    // A headset/Bluetooth route change hands the mic to a
                    // different input device; restarting standby rebinds
                    // the engine to whatever is now active.
                    AudioManager.ACTION_AUDIO_BECOMING_NOISY,
                    AudioManager.ACTION_HEADSET_PLUG,
                    -> if (snapshotState() == ListeningState.STANDBY) {
                        engine?.stop()
                        beginStandby()
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_LOW)
            addAction(Intent.ACTION_BATTERY_OKAY)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            addAction(AudioManager.ACTION_HEADSET_PLUG)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
        registeredReceiver = receiver
    }

    // ---- Foreground notification -------------------------------------------

    /** @return true only if the service genuinely reached the foreground.
     * The caller MUST stop the service when this returns false. */
    private fun startForegroundSafely(): Boolean {
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Declaring the microphone type is mandatory from Android
                // 14 and correct from 10 onward — it is what makes the
                // ongoing mic use visible to the user in system UI, which
                // is exactly the transparency this feature owes them.
                ServiceCompat_startForeground(notification)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            return true
        } catch (e: Exception) {
            // Android 14+ throws if a mic foreground service is started
            // while the app is in the background. That is a real platform
            // restriction, not something to work around — report it, and
            // tell the caller to stop the service. Swallowing this and
            // carrying on leaves the service started but not foregrounded,
            // which the system punishes ~5s later by killing the process.
            Log.w(TAG, "Could not start foreground service", e)
            publish(
                ListeningState.SUSPENDED,
                SuspendReason.MICROPHONE_UNAVAILABLE,
                "Android blocked starting the listening service from the background. Open J.A.R.V.I.S and enable it again.",
            )
            listener?.onError("Android blocked starting background listening. Open the app and re-enable Continuous Listening.")
            return false
        }
    }

    @Suppress("FunctionName")
    private fun ServiceCompat_startForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, ContinuousListeningService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            // Never vague about microphone use: the notification says
            // plainly that the mic is in use and why, and offers a
            // one-tap stop.
            .setContentTitle("J.A.R.V.I.S is listening for your wake word")
            .setContentText("Audio stays on this device until you say \"Jarvis\".")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(open)
            .addAction(0, "Stop listening", stop)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Continuous listening", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown whenever J.A.R.V.I.S is listening for its wake word."
                setShowBadge(false)
            }
        )
    }

    // ---- State publication -------------------------------------------------

    private fun snapshotState(): ListeningState = snapshot.state

    private fun publish(state: ListeningState, reason: SuspendReason, detail: String?) {
        val next = ListeningSnapshot(
            state = state,
            suspendReason = reason,
            engineId = engine?.id ?: "openwakeword",
            available = engine?.isAvailable() ?: true,
            detail = detail,
        )
        snapshot = next
        listener?.onStateChanged(next)
    }
}
