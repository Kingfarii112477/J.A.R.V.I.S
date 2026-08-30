import type { CapacitorConfig } from "@capacitor/cli";

/**
 * STANDALONE Android app — no server, no hosted deployment.
 *
 * The whole UI is bundled into the APK as a static export (built by
 * scripts/build-android.mjs into out/), and the app talks to AI and
 * voice providers directly from the device using credentials the user
 * enters once in Settings and which are stored encrypted on-device
 * (see SecureCredentialsPlugin.kt). There is deliberately no
 * `server.url`: the app never loads its UI from the network.
 *
 * This replaces the earlier remote-WebView architecture, which pointed
 * at a hosted deployment because the app's server-side API routes held
 * the secrets. Those routes still exist for the web deployment; the
 * Android build simply doesn't use them, calling providers itself
 * instead.
 *
 * CapacitorHttp is enabled because that is what makes the direct calls
 * possible: it patches fetch/XMLHttpRequest to go through Android's
 * native HTTP stack, so requests to api.groq.com et al. are not subject
 * to browser CORS rules (those providers do not send CORS headers for
 * arbitrary web origins, so an unpatched WebView fetch would be blocked).
 */
const config: CapacitorConfig = {
  appId: "com.jarvis.aios",
  appName: "J.A.R.V.I.S",
  // The static export produced by scripts/build-android.mjs.
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#020409",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#020409",
    },
  },
};

export default config;
