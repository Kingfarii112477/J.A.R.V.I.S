import type { NextConfig } from "next";

/**
 * The Android app is a STANDALONE static export — it bundles the whole UI
 * into the APK and talks to AI/voice providers directly, so it needs no
 * server and no hosted deployment. The web deployment is unchanged: it
 * still builds normally, with its server-side API routes intact.
 *
 * `output: "export"` is set only when JARVIS_STATIC_EXPORT=1, which
 * scripts/build-android.mjs sets. It cannot be the default, because
 * Next.js refuses to export a project that contains route handlers
 * (verified: "export const dynamic ... not configured on route
 * /api/automation with output: export") — the Android build script
 * temporarily moves src/app/api aside for exactly that reason.
 */
const isStaticExport = process.env.JARVIS_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export" as const,
        // The APK loads files off disk, where /route and /route/ are not
        // interchangeable the way a server can make them.
        trailingSlash: true,
        // No Next.js image optimizer exists without a server.
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
