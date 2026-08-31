package com.jarvis.aios

import android.Manifest
import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.NotificationChannel
import android.app.NotificationManager
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.util.Log
import android.provider.Settings
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.SystemClock
import android.os.StatFs
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * The one bridge between the web app's DeviceAgent tools
 * (src/lib/device/) and real Android capabilities. Every method here
 * does exactly one real, verifiable thing or reports honestly that it
 * couldn't — nothing here fabricates success. Package visibility
 * (isAppAvailable/launchApp) only ever sees the apps declared in
 * AndroidManifest.xml's <queries> block, by design (no
 * QUERY_ALL_PACKAGES).
 */
@CapacitorPlugin(
    name = "DeviceCapability",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = DeviceCapabilityPlugin.NOTIFICATIONS_ALIAS)],
)
class DeviceCapabilityPlugin : Plugin() {

    companion object {
        const val NOTIFICATIONS_ALIAS = "notifications"
        private const val CHANNEL_ID = "jarvis_notifications"
    }

    override fun load() {
        super.load()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(CHANNEL_ID, "J.A.R.V.I.S", NotificationManager.IMPORTANCE_DEFAULT)
                channel.description = "Responses and alerts J.A.R.V.I.S posts as Android notifications."
                manager.createNotificationChannel(channel)
            }
        }
    }

    // ---- App availability / launch ----

    private fun isPackageInstalled(packageName: String): Boolean =
        try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }

    @PluginMethod
    fun isAppAvailable(call: PluginCall) {
        val packageName = call.getString("packageName")
        if (packageName.isNullOrBlank()) {
            call.reject("packageName is required")
            return
        }
        val ret = JSObject()
        ret.put("available", isPackageInstalled(packageName))
        call.resolve(ret)
    }

    @PluginMethod
    fun launchApp(call: PluginCall) {
        val packageName = call.getString("packageName")
        if (packageName.isNullOrBlank()) {
            call.reject("packageName is required")
            return
        }
        val ret = JSObject()
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            ret.put("launched", false)
            ret.put("reason", "$packageName is not installed on this device.")
            call.resolve(ret)
            return
        }
        try {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)
            ret.put("launched", true)
        } catch (e: Exception) {
            ret.put("launched", false)
            ret.put("reason", e.message ?: "Failed to launch $packageName.")
        }
        call.resolve(ret)
    }

    // ---- URL / deep link ----

    @PluginMethod
    fun openUrl(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("url is required")
            return
        }
        val ret = JSObject()
        val uri = try {
            Uri.parse(url)
        } catch (e: Exception) {
            ret.put("opened", false)
            ret.put("usedApp", false)
            ret.put("reason", "Malformed URL.")
            call.resolve(ret)
            return
        }
        val intent = Intent(Intent.ACTION_VIEW, uri)
        val pm = context.packageManager
        val resolved = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        if (resolved == null) {
            ret.put("opened", false)
            ret.put("usedApp", false)
            ret.put("reason", "No app on this device can open that URL.")
            call.resolve(ret)
            return
        }
        // A deliberately simple, honest signal for "did an installed app
        // handle this, or did it just fall through to the browser": compare
        // the resolved handler's package against the device's default
        // browser for a bare http:// URL. Not perfect (some browsers also
        // register as handlers for specific hosts), but never overclaims —
        // worst case it under-reports usedApp as false for an app that
        // happens to share a package family with the default browser.
        val defaultBrowserPackage = pm
            .resolveActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://")), PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo
            ?.packageName
        val resolvedPackage = resolved.activityInfo?.packageName
        val usedApp = resolvedPackage != null && resolvedPackage != defaultBrowserPackage
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            ret.put("opened", true)
            ret.put("usedApp", usedApp)
        } catch (e: Exception) {
            ret.put("opened", false)
            ret.put("usedApp", false)
            ret.put("reason", e.message ?: "Failed to open URL.")
        }
        call.resolve(ret)
    }

    // ---- Media control ----

    @PluginMethod
    fun mediaControl(call: PluginCall) {
        val action = call.getString("action")
        val keyCode = when (action) {
            "play", "pause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
            "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            else -> null
        }
        val ret = JSObject()
        if (keyCode == null) {
            ret.put("ok", false)
            ret.put("reason", "Unsupported media action: $action")
            call.resolve(ret)
            return
        }
        try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val eventTime = SystemClock.uptimeMillis()
            audioManager.dispatchMediaKeyEvent(KeyEvent(eventTime, eventTime, KeyEvent.ACTION_DOWN, keyCode, 0))
            audioManager.dispatchMediaKeyEvent(KeyEvent(eventTime, eventTime, KeyEvent.ACTION_UP, keyCode, 0))
            // Dispatching the key event genuinely happened — that's the real,
            // verifiable action within reach here without binding to a
            // specific app's MediaSession (which would need the invasive
            // notification-listener permission). Whether a media app is
            // actually active to receive it isn't something this can verify.
            ret.put("ok", true)
        } catch (e: Exception) {
            ret.put("ok", false)
            ret.put("reason", e.message ?: "Failed to dispatch media key.")
        }
        call.resolve(ret)
    }

    // ---- Device status ----

    @PluginMethod
    fun getDeviceStatus(call: PluginCall) {
        val ret = JSObject()

        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        ret.put("batteryLevel", if (level >= 0 && scale > 0) level.toDouble() / scale.toDouble() else null)
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        ret.put("isCharging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)

        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork
        val capabilities = network?.let { connectivityManager.getNetworkCapabilities(it) }
        ret.put("isOnline", capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
        ret.put(
            "networkType",
            when {
                capabilities == null -> "none"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                else -> "unknown"
            },
        )

        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        ret.put("wifiEnabled", wifiManager?.isWifiEnabled)

        ret.put(
            "bluetoothEnabled",
            try {
                val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                bluetoothManager?.adapter?.isEnabled
            } catch (e: SecurityException) {
                null
            },
        )

        ret.put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
        ret.put("androidVersion", Build.VERSION.RELEASE)

        try {
            val stat = StatFs(context.filesDir.absolutePath)
            ret.put("storageAvailableBytes", stat.availableBytes)
            ret.put("storageTotalBytes", stat.totalBytes)
        } catch (e: Exception) {
            ret.put("storageAvailableBytes", null)
            ret.put("storageTotalBytes", null)
        }

        call.resolve(ret)
    }

    // ---- Notifications ----

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
            return
        }
        if (getPermissionState(NOTIFICATIONS_ALIAS) == PermissionState.GRANTED) {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
            return
        }
        requestPermissionForAlias(NOTIFICATIONS_ALIAS, call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val ret = JSObject()
        val granted = getPermissionState(NOTIFICATIONS_ALIAS) == PermissionState.GRANTED
        ret.put("granted", granted)
        if (!granted) ret.put("reason", "Notification permission was denied.")
        call.resolve(ret)
    }

    @PluginMethod
    fun postNotification(call: PluginCall) {
        val title = call.getString("title") ?: ""
        val body = call.getString("body") ?: ""
        val ret = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState(NOTIFICATIONS_ALIAS) != PermissionState.GRANTED) {
            ret.put("posted", false)
            ret.put("reason", "Notification permission not granted — call requestNotificationPermission first.")
            call.resolve(ret)
            return
        }
        try {
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(context.applicationInfo.icon)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), notification)
            ret.put("posted", true)
        } catch (e: SecurityException) {
            ret.put("posted", false)
            ret.put("reason", e.message ?: "Notification permission denied.")
        }
        call.resolve(ret)
    }

    /**
     * Opens this app's page in Android's system settings.
     *
     * Needed because once the microphone permission has been denied twice,
     * Android stops showing the permission dialog entirely — asking again is
     * a silent no-op. At that point the only way back is the app's settings
     * page, so the UI needs to be able to send the user straight there
     * instead of showing an error they have no way to act on.
     */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("opened", false).put("reason", e.message ?: "unavailable"))
        }
    }

    /**
     * Why the app process died last time, straight from Android.
     *
     * Exists because this app has been dying instantly with no dialog, no
     * Java stack trace and no visible error — the user sees it vanish and
     * there is nothing to report. Guessing from symptoms has already cost
     * two wrong diagnoses. ActivityManager keeps the real answer:
     * getHistoricalProcessExitReasons() records every process death with
     * its cause, including the ones nothing in the app can catch — a
     * native (C++) crash, an ANR, or the kernel's low-memory killer.
     *
     * Requires API 30. Below that Android keeps no such record, and this
     * says so rather than inventing one.
     */
    @PluginMethod
    fun getLastExitInfo(call: PluginCall) {
        val out = JSObject()
        // A recovered renderer fault leaves no trace in the process-exit
        // history (the process survived), so it is reported alongside it.
        try {
            val diag = context.applicationContext
                .getSharedPreferences(WebViewRecoveryListener.PREFS, Context.MODE_PRIVATE)
            val goneAt = diag.getLong(WebViewRecoveryListener.KEY_RENDERER_GONE_AT, 0L)
            if (goneAt > 0L) {
                out.put("rendererGoneAt", goneAt)
                out.put("rendererCrashed", diag.getBoolean(WebViewRecoveryListener.KEY_RENDERER_GONE_CRASHED, false))
            }
        } catch (e: Exception) {
            Log.w("JarvisExitInfo", "Could not read renderer diagnostics", e)
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            call.resolve(out.put("available", false).put("reason", "Android 11 or newer is needed to read exit reasons."))
            return
        }
        try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val history = am.getHistoricalProcessExitReasons(context.packageName, 0, 5)
            val last = history.firstOrNull()
            if (last == null) {
                call.resolve(out.put("available", true).put("hasExit", false))
                return
            }
            out.put("available", true)
            out.put("hasExit", true)
            out.put("reasonCode", last.reason)
            out.put("reason", describeExitReason(last.reason))
            out.put("description", last.description ?: "")
            out.put("timestamp", last.timestamp)
            out.put("importance", last.importance)
            // "Abnormal" is what decides whether the app says anything to
            // the user: a normal exit or a user-initiated stop is not worth
            // reporting, a crash or an OOM kill very much is.
            out.put(
                "abnormal",
                last.reason == ApplicationExitInfo.REASON_CRASH ||
                    last.reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
                    last.reason == ApplicationExitInfo.REASON_ANR ||
                    last.reason == ApplicationExitInfo.REASON_LOW_MEMORY ||
                    last.reason == ApplicationExitInfo.REASON_SIGNALED ||
                    last.reason == ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE,
            )
            call.resolve(out)
        } catch (e: Exception) {
            Log.w("JarvisExitInfo", "Could not read exit reasons", e)
            call.resolve(out.put("available", false).put("reason", e.message ?: "unavailable"))
        }
    }

    private fun describeExitReason(code: Int): String = when (code) {
        ApplicationExitInfo.REASON_CRASH -> "App crashed (uncaught Java/Kotlin exception)"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash (C/C++ code, e.g. a segfault)"
        ApplicationExitInfo.REASON_ANR -> "Not responding (ANR)"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "Killed by the system to reclaim memory"
        ApplicationExitInfo.REASON_SIGNALED -> "Killed by a signal"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Killed for excessive resource use"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "Closed by the user"
        ApplicationExitInfo.REASON_USER_STOPPED -> "Force-stopped by the user"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "A process it depended on died"
        ApplicationExitInfo.REASON_OTHER -> "Other"
        ApplicationExitInfo.REASON_EXIT_SELF -> "Exited normally"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "Restarted after a permission change"
        else -> "Unknown (code $code)"
    }
}
