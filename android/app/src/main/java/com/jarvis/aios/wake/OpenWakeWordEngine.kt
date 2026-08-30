package com.jarvis.aios.wake

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import kotlin.concurrent.thread

/**
 * On-device "Hey JARVIS" detection using openWakeWord's ONNX model chain.
 *
 * Chosen over a proprietary engine because it needs no account, no API
 * key, and no network at any point — the models ship in the APK
 * (assets/wakeword/) and inference is entirely local. That is what makes
 * the privacy claim in ContinuousListeningService verifiable rather than
 * merely stated.
 *
 * MODEL LICENSING — important: openWakeWord's *code* is Apache 2.0, but
 * these pre-trained models are CC BY-NC-SA 4.0 (NonCommercial) because
 * of their training data. Fine for personal/non-commercial use; a real
 * constraint on commercial distribution. See the README.
 *
 * PIPELINE (every shape below verified by running the real models, not
 * assumed — see config/voice.ts and the README's Phase 8 notes):
 *
 *   AudioRecord 16 kHz mono
 *     -> 1280-sample frames (80 ms)
 *     -> melspectrogram.onnx      -> 5 frames x 32 mel bins
 *     -> (v / 10) + 2             (openWakeWord's required transform)
 *     -> sliding 76-frame window, step 8
 *        -> embedding_model.onnx  -> 96 dims
 *     -> sliding 16-embedding window
 *        -> hey_jarvis_v0.1.onnx  -> score
 *
 * A detection needs ~3.14 s of audio context (76 + 8*15 = 196 mel
 * frames) before the first score exists, so a freshly started detector
 * is briefly warming up rather than broken.
 */
class OpenWakeWordEngine private constructor(
    private val context: Context,
    @Volatile private var threshold: Float,
    @Volatile private var debounceMs: Long,
) : WakeWordEngine {

    companion object {
        private const val TAG = "JarvisWakeWord"

        const val SAMPLE_RATE = 16000
        const val FRAME_SAMPLES = 1280
        private const val MEL_BINS = 32
        private const val EMB_WINDOW = 76
        private const val EMB_STEP = 8
        private const val EMB_DIM = 96
        private const val CLS_WINDOW = 16

        private const val ASSET_MEL = "wakeword/melspectrogram.onnx"
        private const val ASSET_EMB = "wakeword/embedding_model.onnx"
        private const val ASSET_DET = "wakeword/hey_jarvis_v0.1.onnx"

        /**
         * openWakeWord models are always present (bundled in the APK), so
         * unlike a key-gated engine this never has to report itself
         * unconfigured. It can still fail at runtime — a missing asset or
         * an ONNX init failure — which [start] reports honestly.
         */
        fun create(context: Context, sensitivity: Float, debounceMs: Long): WakeWordEngine =
            OpenWakeWordEngine(context.applicationContext, sensitivity.coerceIn(0f, 1f), debounceMs)
    }

    private var env: OrtEnvironment? = null
    private var melSession: OrtSession? = null
    private var embSession: OrtSession? = null
    private var detSession: OrtSession? = null

    private var recorder: AudioRecord? = null
    @Volatile private var running = false
    private var worker: Thread? = null

    // Sliding-window state. Only touched on the worker thread.
    private val melBuffer = ArrayList<Float>()
    private val embeddings = ArrayList<FloatArray>()
    private var windowPos = 0
    private var melDropped = 0
    private var lastFiredAt = Long.MIN_VALUE

    override val id = "openwakeword"

    override fun isAvailable() = true

    fun setThreshold(value: Float) {
        threshold = value.coerceIn(0f, 1f)
    }

    fun setDebounce(ms: Long) {
        debounceMs = ms
    }

    @Synchronized
    override fun start(onWake: () -> Unit, onError: (String) -> Unit): Boolean {
        if (running) return true
        return try {
            loadModels()
            val record = openRecorder()
                ?: run {
                    onError("Microphone could not be opened for wake-word detection — it may be in use by another app.")
                    return false
                }
            recorder = record
            resetState()
            running = true
            record.startRecording()
            worker = thread(name = "jarvis-wakeword", isDaemon = true) { loop(onWake, onError) }
            true
        } catch (e: Exception) {
            Log.w(TAG, "Wake-word start failed", e)
            onError("Wake-word engine failed to start: ${e.message ?: e::class.java.simpleName}")
            releaseAudio()
            false
        }
    }

    @Synchronized
    override fun stop() {
        if (!running) return
        running = false
        // Join briefly so the recorder isn't released out from under a
        // read in flight, which some devices surface as a hard crash.
        runCatching { worker?.join(500) }
        worker = null
        releaseAudio()
        resetState()
    }

    @Synchronized
    override fun release() {
        stop()
        runCatching { melSession?.close() }
        runCatching { embSession?.close() }
        runCatching { detSession?.close() }
        melSession = null
        embSession = null
        detSession = null
        // OrtEnvironment is a shared singleton; deliberately not closed.
        env = null
    }

    // ---- Audio ------------------------------------------------------------

    private fun openRecorder(): AudioRecord? {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) return null
        // Several frames of headroom so a scheduling hiccup doesn't drop
        // audio mid-phrase.
        val bufferSize = maxOf(minBuffer, FRAME_SAMPLES * 2 * 4)
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
        } catch (e: SecurityException) {
            // RECORD_AUDIO not granted — the caller checks first, but the
            // grant can be revoked while running.
            Log.w(TAG, "Microphone permission missing", e)
            return null
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            runCatching { record.release() }
            return null
        }
        return record
    }

    private fun releaseAudio() {
        recorder?.let {
            runCatching { if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop() }
            runCatching { it.release() }
        }
        recorder = null
    }

    private fun loop(onWake: () -> Unit, onError: (String) -> Unit) {
        val pcm = ShortArray(FRAME_SAMPLES)
        val frame = FloatArray(FRAME_SAMPLES)
        try {
            while (running) {
                val record = recorder ?: break
                var read = 0
                while (read < FRAME_SAMPLES && running) {
                    val n = record.read(pcm, read, FRAME_SAMPLES - read)
                    if (n <= 0) break
                    read += n
                }
                if (!running) break
                if (read < FRAME_SAMPLES) continue

                // 16-bit PCM -> normalized float, the range the mel model
                // was exported for.
                for (i in 0 until FRAME_SAMPLES) frame[i] = pcm[i] / 32768.0f

                val score = processFrame(frame)
                if (score != null && score >= threshold) {
                    val now = System.currentTimeMillis()
                    // Debounce: one spoken phrase stays inside the ~3 s
                    // classifier context for dozens of consecutive frames
                    // and would otherwise fire every 80 ms.
                    if (now - lastFiredAt >= debounceMs) {
                        lastFiredAt = now
                        resetState()
                        onWake()
                    }
                }
            }
        } catch (e: Exception) {
            if (running) {
                Log.w(TAG, "Wake-word loop failed", e)
                onError("Wake-word detection stopped: ${e.message ?: e::class.java.simpleName}")
            }
        }
    }

    // ---- Inference --------------------------------------------------------

    /** Returns the newest score this frame produced, or null while the
     * pipeline is still warming up. */
    private fun processFrame(frame: FloatArray): Float? {
        val ortEnv = env ?: return null
        val mel = melSession ?: return null
        val embModel = embSession ?: return null
        val det = detSession ?: return null

        // 1) melspectrogram
        OnnxTensor.createTensor(ortEnv, FloatBuffer.wrap(frame), longArrayOf(1, frame.size.toLong())).use { input ->
            mel.run(mapOf(mel.inputNames.first() to input)).use { result ->
                @Suppress("UNCHECKED_CAST")
                val out = result[0].value
                flattenMel(out).forEach { melBuffer.add(it / 10.0f + 2.0f) }
            }
        }

        var latest: Float? = null

        // 2) embeddings for every complete 76-frame window
        while (true) {
            val start = windowPos - melDropped
            val needed = (start + EMB_WINDOW) * MEL_BINS
            if (start < 0 || needed > melBuffer.size) break

            val window = FloatArray(EMB_WINDOW * MEL_BINS)
            for (i in window.indices) window[i] = melBuffer[start * MEL_BINS + i]

            OnnxTensor.createTensor(
                ortEnv,
                FloatBuffer.wrap(window),
                longArrayOf(1, EMB_WINDOW.toLong(), MEL_BINS.toLong(), 1),
            ).use { input ->
                embModel.run(mapOf(embModel.inputNames.first() to input)).use { result ->
                    embeddings.add(flatten(result[0].value))
                }
            }
            windowPos += EMB_STEP

            // 3) classify once 16 embeddings are available
            if (embeddings.size >= CLS_WINDOW) {
                val stack = FloatArray(CLS_WINDOW * EMB_DIM)
                val first = embeddings.size - CLS_WINDOW
                for (e in 0 until CLS_WINDOW) {
                    embeddings[first + e].copyInto(stack, e * EMB_DIM)
                }
                OnnxTensor.createTensor(
                    ortEnv,
                    FloatBuffer.wrap(stack),
                    longArrayOf(1, CLS_WINDOW.toLong(), EMB_DIM.toLong()),
                ).use { input ->
                    det.run(mapOf(det.inputNames.first() to input)).use { result ->
                        latest = flatten(result[0].value).firstOrNull()
                    }
                }
            }
        }

        trim()
        return latest
    }

    /**
     * Bounds memory during indefinite listening. Without this an
     * always-on detector grows without limit, which is precisely the leak
     * that makes continuous listening unshippable.
     */
    private fun trim() {
        val keepFrom = windowPos - melDropped
        if (keepFrom > EMB_WINDOW) {
            val drop = keepFrom - EMB_WINDOW
            repeat(drop * MEL_BINS) { if (melBuffer.isNotEmpty()) melBuffer.removeAt(0) }
            melDropped += drop
        }
        while (embeddings.size > CLS_WINDOW * 2) embeddings.removeAt(0)
    }

    private fun resetState() {
        melBuffer.clear()
        embeddings.clear()
        windowPos = 0
        melDropped = 0
    }

    private fun loadModels() {
        if (melSession != null && embSession != null && detSession != null) return
        val ortEnv = OrtEnvironment.getEnvironment()
        env = ortEnv
        val opts = OrtSession.SessionOptions().apply {
            // One thread: measured cost is ~1% of a core for realtime
            // audio, and extra threads only add wakeups on a device that
            // is supposed to be idling.
            setIntraOpNumThreads(1)
            setInterOpNumThreads(1)
        }
        melSession = ortEnv.createSession(readAsset(ASSET_MEL), opts)
        embSession = ortEnv.createSession(readAsset(ASSET_EMB), opts)
        detSession = ortEnv.createSession(readAsset(ASSET_DET), opts)
    }

    private fun readAsset(name: String): ByteArray =
        context.assets.open(name).use { it.readBytes() }

    // ONNX Runtime returns nested arrays whose exact nesting depends on
    // the graph's output rank; flatten defensively rather than assuming
    // one shape.
    private fun flatten(value: Any?): FloatArray {
        val out = ArrayList<Float>()
        fun walk(v: Any?) {
            when (v) {
                is FloatArray -> v.forEach { out.add(it) }
                is Array<*> -> v.forEach { walk(it) }
                is Float -> out.add(v)
                else -> {}
            }
        }
        walk(value)
        return out.toFloatArray()
    }

    private fun flattenMel(value: Any?): FloatArray = flatten(value)
}
