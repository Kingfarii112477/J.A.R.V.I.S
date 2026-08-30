package com.jarvis.aios.listening

/**
 * The native service's own listening lifecycle.
 *
 * Deliberately NOT a duplicate of the web layer's conversation state
 * machine (src/lib/voice/continuous/conversation.ts). This enum tracks
 * only what the *native* layer actually owns — who holds the microphone
 * and why. The richer conversational phases (THINKING, EXECUTING,
 * SPEAKING, FOLLOW_UP) belong to the web layer, which owns the reasoning
 * pipeline. Keeping the split along the "who owns the mic" line is what
 * stops these from becoming two competing state machines.
 */
enum class ListeningState {
    /** Service not running; nothing holds the microphone. */
    STOPPED,

    /** Wake-word engine is listening locally. No audio leaves the device. */
    STANDBY,

    /** Wake phrase heard; microphone released and handed to the web
     * layer for the actual command capture. */
    HANDED_OFF,

    /** Deliberately not listening — audio focus lost, a call is active,
     * battery critically low, or the microphone is unavailable. Distinct
     * from STOPPED because the service intends to resume automatically. */
    SUSPENDED,

    /** The wake-word engine could not run at all (e.g. no AccessKey
     * configured, or it failed to initialize). */
    UNAVAILABLE,
}

/** Why the service is currently suspended — surfaced to the UI so it can
 * say something true rather than a generic "not listening". */
enum class SuspendReason {
    NONE,
    AUDIO_FOCUS_LOST,
    PHONE_CALL,
    BATTERY_LOW,
    MICROPHONE_UNAVAILABLE,
    PERMISSION_DENIED,
}

/**
 * A snapshot the plugin can hand to the WebView at any time — including
 * right after an Activity/WebView recreation, which is exactly when the
 * web layer has lost its own copy of the state and needs to resync from
 * the service (which never stopped running).
 */
data class ListeningSnapshot(
    val state: ListeningState,
    val suspendReason: SuspendReason,
    val engineId: String,
    val available: Boolean,
    val detail: String?,
)
