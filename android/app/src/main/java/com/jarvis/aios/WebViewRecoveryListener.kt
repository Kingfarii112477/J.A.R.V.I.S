package com.jarvis.aios

import android.app.Activity
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.widget.Toast
import com.getcapacitor.WebViewListener

/**
 * Keeps the app alive when the WebView's renderer process dies.
 *
 * Android runs the WebView's rendering in a separate process. If that
 * process is killed — GPU/OOM pressure, a driver fault, a lost WebGL
 * context it cannot recover — the framework calls onRenderProcessGone.
 * Returning false there means "not handled", and Android responds by
 * killing the whole app process: no exception, no dialog, the app simply
 * vanishes from the screen.
 *
 * Capacitor exposes the callback but its default WebViewListener returns
 * false, so an app that registers no listener dies on every renderer
 * fault. This app is especially exposed to that because several screens
 * each create their own WebGL canvas (the 3D core on the dashboard, the
 * voice screen, systems, memory), and moving between them puts real
 * pressure on renderer memory.
 *
 * Returning true claims the event and lets the app act instead of being
 * killed. The WebView whose renderer died can never be reused — the
 * Android contract requires destroying it — so the Activity is recreated,
 * which rebuilds the bridge and WebView from scratch. That turns a silent
 * process death into a reload the user can understand.
 */
class WebViewRecoveryListener(private val activity: Activity) : WebViewListener() {

    companion object {
        private const val TAG = "JarvisWebView"
    }

    override fun onRenderProcessGone(webView: WebView?, detail: RenderProcessGoneDetail?): Boolean {
        val crashed = detail?.didCrash() == true
        Log.w(
            TAG,
            if (crashed) "WebView renderer crashed; recreating the activity"
            else "WebView renderer was killed to reclaim memory; recreating the activity",
        )

        activity.runOnUiThread {
            // Detach and destroy the dead WebView first: reusing one whose
            // renderer has gone is undefined behaviour and can take the
            // process down again.
            try {
                (webView?.parent as? android.view.ViewGroup)?.removeView(webView)
                webView?.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "Could not tear down the dead WebView", e)
            }

            if (!activity.isFinishing && !activity.isDestroyed) {
                Toast.makeText(
                    activity,
                    if (crashed) "J.A.R.V.I.S display crashed and is restarting."
                    else "J.A.R.V.I.S ran low on memory and is restarting the display.",
                    Toast.LENGTH_LONG,
                ).show()
                activity.recreate()
            }
        }
        return true
    }
}
