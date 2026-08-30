#!/usr/bin/env node
/**
 * Builds the STANDALONE Android app.
 *
 * The APK bundles the entire UI and talks to AI/voice providers directly
 * from the device, so it needs no server and no hosted deployment.
 *
 * Why this script exists rather than a plain `next build`: Next.js
 * refuses to run `output: "export"` on a project that contains route
 * handlers — it fails with "export const dynamic = ... not configured on
 * route /api/automation". The web deployment genuinely needs those
 * routes (that is where its secrets live), so they can't simply be
 * deleted. This moves src/app/api aside for the duration of the export
 * and puts it back afterwards.
 *
 * The restore runs in a finally block: a failed build must never leave
 * the repository without its API routes.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apiDir = join(root, "src", "app", "api");
const stashDir = join(root, ".api-stash");
const outDir = join(root, "out");

function run(command, env = {}) {
  console.log(`\n▸ ${command}`);
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
}

let stashed = false;

try {
  // A leftover stash means a previous run died between the two renames.
  // Recover rather than clobbering it.
  if (existsSync(stashDir)) {
    if (existsSync(apiDir)) {
      throw new Error(
        `Both ${apiDir} and ${stashDir} exist. A previous build likely failed mid-way — ` +
          `inspect .api-stash and merge/remove it manually before rebuilding.`
      );
    }
    console.log("▸ Recovering API routes from a previous interrupted build");
    renameSync(stashDir, apiDir);
  }

  if (existsSync(apiDir)) {
    console.log("▸ Moving src/app/api aside for the static export");
    mkdirSync(join(stashDir, ".."), { recursive: true });
    renameSync(apiDir, stashDir);
    stashed = true;
  }

  // A stale export directory would let deleted pages linger in the APK.
  rmSync(outDir, { recursive: true, force: true });
  // .next must go too, not just out/: Next generates a route-type
  // validator that imports every route handler it saw last build, so a
  // .next left over from a normal (API-including) build fails the export
  // with "Cannot find module '../../../src/app/api/.../route.js'" the
  // moment those routes are stashed.
  rmSync(join(root, ".next"), { recursive: true, force: true });

  run("npx next build", { JARVIS_STATIC_EXPORT: "1" });

  if (!existsSync(outDir)) {
    throw new Error("next build did not produce an out/ directory — the static export failed.");
  }
} finally {
  if (stashed && existsSync(stashDir)) {
    console.log("▸ Restoring src/app/api");
    renameSync(stashDir, apiDir);
  }
}

// Only sync after the routes are safely back, so the working tree is
// correct even if this step fails.
run("npx cap sync android");

console.log(
  "\n✅ Standalone Android web assets built into out/ and synced.\n" +
    "   The APK now contains the full UI and contacts providers directly —\n" +
    "   no server or hosted deployment is involved.\n\n" +
    "   Next: cd android && ./gradlew assembleRelease   (or bundleRelease)\n"
);
