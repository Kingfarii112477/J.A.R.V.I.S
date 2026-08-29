import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell wraps the SAME Next.js app deployed to Netlify — it
 * is not a bundled static copy. This is a deliberate architecture choice
 * (see README's "Native Android app" section): the app has server-side
 * API routes (/api/voice/*, /api/reasoning, ...) that hold real secrets
 * and cannot run inside a static WebView bundle, and a Trusted Web
 * Activity can't host the custom native plugins this app needs
 * (app-launch, deep links, device status, media controls). Capacitor
 * pointed at a live server URL gets both: real native plugin access AND
 * a backend that actually works.
 *
 * CAPACITOR_SERVER_URL must be set to the production deployment before
 * building a release APK/AAB — the placeholder below will build, but the
 * app will only ever reach whatever that URL actually serves.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://jarvis-ai-os-android.netlify.app";

const config: CapacitorConfig = {
  appId: "com.jarvis.aios",
  appName: "J.A.R.V.I.S",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
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
