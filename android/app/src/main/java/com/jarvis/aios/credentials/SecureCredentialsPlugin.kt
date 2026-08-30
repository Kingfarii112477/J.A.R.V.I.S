package com.jarvis.aios.credentials

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * On-device storage for the user's own AI/voice provider API keys.
 *
 * This exists because the app is standalone: there is no server to hold
 * secrets, so the keys have to live on the device — and they must not be
 * compiled into the APK, where anyone could extract them from a
 * distributed binary. Instead the user enters their keys once in
 * Settings and they are encrypted here.
 *
 * ENCRYPTION: AES-256-GCM with a key generated inside the Android
 * Keystore. The key material never leaves the keystore (hardware-backed
 * on devices with a TEE/StrongBox) and cannot be exported, so the
 * ciphertext in SharedPreferences is useless without this specific app
 * on this specific device.
 *
 * Deliberately NOT using androidx.security:security-crypto
 * (EncryptedSharedPreferences): Google has deprecated it, and doing the
 * AES-GCM wrapping directly here uses only stable platform APIs while
 * being about the same amount of code.
 *
 * The preferences file is excluded from Android cloud backup (see
 * data_extraction_rules.xml) so keys are never uploaded off the device.
 */
@CapacitorPlugin(name = "SecureCredentials")
class SecureCredentialsPlugin : Plugin() {

    companion object {
        private const val TAG = "JarvisCredentials"
        private const val PREFS = "jarvis_secure_credentials"
        private const val KEY_ALIAS = "jarvis_credentials_key"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_BITS = 128
        private const val IV_BYTES = 12

        /** Exactly the credentials this app knows how to use. An
         * allow-list rather than arbitrary key/value storage, so a bug
         * elsewhere can't turn this into a general secret dumping
         * ground. */
        val ALLOWED = setOf(
            "OPENROUTER_API_KEY",
            "OPENROUTER_MODEL",
            "GROQ_API_KEY",
            "GROQ_MODEL",
            "OPENAI_COMPATIBLE_API_KEY",
            "OPENAI_COMPATIBLE_BASE_URL",
            "OPENAI_COMPATIBLE_MODEL",
            "ASSEMBLYAI_API_KEY",
            "AZURE_SPEECH_KEY",
            "AZURE_SPEECH_REGION",
            "OPENAI_API_KEY",
            "ELEVENLABS_API_KEY",
            "ELEVENLABS_VOICE_ID",
        )
    }

    private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // Deliberately NOT requiring user authentication: the
                // wake word must work hands-free, and forcing a device
                // unlock for every provider call would break that. The
                // protection here is against another app or an extracted
                // backup reading the keys, which this achieves.
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv
        val body = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        // Prefix the IV so decrypt is self-contained; GCM IVs are not
        // secret, only single-use, and a fresh one is generated per call.
        val combined = ByteArray(iv.size + body.size)
        iv.copyInto(combined, 0)
        body.copyInto(combined, iv.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String? = try {
        val combined = Base64.decode(stored, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, IV_BYTES)
        val body = combined.copyOfRange(IV_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        String(cipher.doFinal(body), Charsets.UTF_8)
    } catch (e: Exception) {
        // Most likely the keystore key was invalidated (app data cleared,
        // device restored). Treat as "not configured" rather than
        // crashing — the UI will prompt for the key again.
        Log.w(TAG, "Could not decrypt a stored credential; treating as unset", e)
        null
    }

    /** Returns every configured credential. Called once at startup so
     * the web layer can build its provider config. */
    @PluginMethod
    fun getAll(call: PluginCall) {
        val out = JSObject()
        for (key in ALLOWED) {
            val stored = prefs().getString(key, null) ?: continue
            decrypt(stored)?.let { out.put(key, it) }
        }
        call.resolve(out)
    }

    /** Which credentials are set — WITHOUT returning their values, so
     * the settings UI can show status without handling secrets. */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val out = JSObject()
        for (key in ALLOWED) out.put(key, prefs().contains(key))
        call.resolve(out)
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key == null || key !in ALLOWED) {
            call.reject("Unknown credential key.")
            return
        }
        if (value.isNullOrBlank()) {
            prefs().edit().remove(key).apply()
            call.resolve(JSObject().put("saved", false).put("cleared", true))
            return
        }
        try {
            prefs().edit().putString(key, encrypt(value.trim())).apply()
            call.resolve(JSObject().put("saved", true).put("cleared", false))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to store credential", e)
            call.reject("Could not securely store that credential: ${e.message ?: "unknown error"}")
        }
    }

    /** Wipes every stored credential — the user-facing "forget my keys"
     * action. */
    @PluginMethod
    fun clearAll(call: PluginCall) {
        prefs().edit().clear().apply()
        call.resolve()
    }
}
