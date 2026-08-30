package com.jarvis.aios.wake

/**
 * On-device wake-word detection.
 *
 * Deliberately mirrors the provider-abstraction pattern the web layer
 * already uses for STT/TTS/device capabilities (src/lib/voice/stt/,
 * src/lib/device/): one interface, a real implementation, and an
 * honest "unavailable" implementation — never a third path that fakes
 * detection. Nothing in this package may ever synthesize a wake event
 * from a timer, a counter, or a placeholder: a WAKE event means a real
 * acoustic detection happened, or it is not emitted at all.
 *
 * PRIVACY CONTRACT (the whole reason this layer exists): while the app
 * is in standby, microphone audio is consumed ONLY by the local
 * detector below. It is never buffered to disk, never uploaded, never
 * sent to a cloud STT service, and never sent to the reasoning model.
 * The only thing that escapes this package during standby is the fact
 * that the wake phrase was heard.
 */
interface WakeWordEngine {
    /** Stable identifier surfaced to the web layer for honest status
     * reporting ("porcupine" vs "unavailable"). */
    val id: String

    /** Whether this engine can actually run right now. False means the
     * caller must report wake-word detection as unavailable — never
     * substitute a fake. */
    fun isAvailable(): Boolean

    /**
     * Begins listening for the wake phrase. Returns true only if
     * detection genuinely started.
     *
     * The engine owns the microphone while running; callers must
     * [stop] it before any other component (e.g. the WebView's own
     * capture for the actual command) tries to record, since Android
     * gives exclusive input access to one consumer at a time.
     */
    fun start(onWake: () -> Unit, onError: (String) -> Unit): Boolean

    /** Stops detection and releases the microphone. Safe to call when
     * not running. */
    fun stop()

    /** Releases all native resources. The engine is unusable afterwards. */
    fun release()
}

/**
 * The honest fallback when no wake-word engine can run — most commonly
 * because no Picovoice AccessKey was configured at build time (see
 * app/build.gradle's PICOVOICE_ACCESS_KEY). Reports unavailable and
 * never pretends to hear anything.
 */
class UnavailableWakeWordEngine(private val reason: String) : WakeWordEngine {
    override val id = "unavailable"
    override fun isAvailable() = false

    override fun start(onWake: () -> Unit, onError: (String) -> Unit): Boolean {
        onError(reason)
        return false
    }

    override fun stop() { /* nothing to stop */ }
    override fun release() { /* nothing to release */ }
}
