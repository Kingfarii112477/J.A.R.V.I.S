package com.jarvis.aios.wake

import android.content.Context
import android.util.Log
import ai.picovoice.porcupine.Porcupine
import ai.picovoice.porcupine.PorcupineException
import ai.picovoice.porcupine.PorcupineManager

/**
 * Real on-device wake-word detection via Picovoice Porcupine.
 *
 * Why Porcupine specifically:
 *  - "Jarvis" is one of its BUILT-IN keywords, so this needs no custom
 *    model file, no training pipeline, and no per-user model shipping.
 *  - Detection runs entirely on-device. No audio leaves the phone during
 *    standby, which is the privacy contract this whole feature depends
 *    on.
 *  - It is designed for exactly this always-on duty cycle (small,
 *    fixed-cost DSP + tiny neural net per frame), which is what makes
 *    continuous listening viable on a battery instead of streaming audio
 *    to a cloud recognizer.
 *
 * PorcupineManager owns its own microphone capture and detection thread;
 * this class is a thin, honest wrapper that adds lifecycle safety and
 * converts failures into reported errors rather than crashes.
 *
 * Requires a Picovoice AccessKey (free tier available) supplied at build
 * time through BuildConfig.PICOVOICE_ACCESS_KEY — see app/build.gradle.
 * The key is validated locally at init; detection itself stays offline.
 * With no key configured this class is never constructed at all (see
 * [create]) and the caller falls back to [UnavailableWakeWordEngine].
 */
class PorcupineWakeWordEngine private constructor(
    private val context: Context,
    private val accessKey: String,
    private val sensitivity: Float,
) : WakeWordEngine {

    companion object {
        private const val TAG = "JarvisWakeWord"

        /**
         * Builds a Porcupine engine, or returns an honest unavailable
         * engine when no AccessKey is configured. Never returns
         * something that pretends to work.
         *
         * @param sensitivity 0..1 — higher catches more real utterances
         *   at the cost of more false triggers. Exposed so the web
         *   layer's "Microphone Sensitivity" setting maps to a real
         *   engine parameter rather than a decorative slider.
         */
        fun create(context: Context, accessKey: String, sensitivity: Float): WakeWordEngine {
            if (accessKey.isBlank()) {
                return UnavailableWakeWordEngine(
                    "Wake-word detection isn't configured on this build — no Picovoice AccessKey was supplied. " +
                        "Continuous listening is unavailable until one is set (see the README's Android section)."
                )
            }
            return PorcupineWakeWordEngine(context.applicationContext, accessKey, sensitivity.coerceIn(0f, 1f))
        }
    }

    private var manager: PorcupineManager? = null
    private var running = false

    override val id = "porcupine"

    /** The AccessKey's presence is checked in [create]; anything past
     * that is a genuine runtime attempt. */
    override fun isAvailable() = true

    @Synchronized
    override fun start(onWake: () -> Unit, onError: (String) -> Unit): Boolean {
        if (running) return true
        return try {
            val built = PorcupineManager.Builder()
                .setAccessKey(accessKey)
                .setKeyword(Porcupine.BuiltInKeyword.JARVIS)
                .setSensitivity(sensitivity)
                .build(context) { _ ->
                    // keywordIndex is always 0 here — a single keyword is
                    // configured. Emitting the bare fact of detection is
                    // deliberately ALL that leaves this layer.
                    onWake()
                }
            built.start()
            manager = built
            running = true
            true
        } catch (e: PorcupineException) {
            // Most commonly an invalid/expired AccessKey or an activation
            // limit — surface it verbatim rather than silently degrading,
            // so the UI can say wake word is unavailable and why.
            Log.w(TAG, "Porcupine failed to start", e)
            onError("Wake-word engine failed to start: ${e.message ?: e::class.java.simpleName}")
            safeRelease()
            false
        } catch (e: Exception) {
            // Microphone busy/denied, or a device-specific audio failure.
            Log.w(TAG, "Wake-word start failed", e)
            onError("Wake-word engine could not access the microphone: ${e.message ?: e::class.java.simpleName}")
            safeRelease()
            false
        }
    }

    @Synchronized
    override fun stop() {
        if (!running) return
        running = false
        try {
            manager?.stop()
        } catch (e: Exception) {
            // Stopping a already-torn-down recorder can throw on some
            // devices; releasing below is what actually matters.
            Log.w(TAG, "Wake-word stop threw (continuing to release)", e)
        }
    }

    @Synchronized
    override fun release() {
        stop()
        safeRelease()
    }

    private fun safeRelease() {
        try {
            manager?.delete()
        } catch (e: Exception) {
            Log.w(TAG, "Wake-word release threw", e)
        }
        manager = null
        running = false
    }
}
