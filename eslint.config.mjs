import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This project does not enable the React Compiler (babel-plugin-react-compiler /
      // next.config's reactCompiler flag), so these two rules are pure
      // forward-compatibility checks rather than checks against real bugs here:
      //  - react-hooks/purity flags Math.random()/Date.now() inside useMemo bodies
      //    and event-handler helpers, which is the standard, safe way to do
      //    one-time randomized geometry generation (Three.js particle/ring layout)
      //    and jitter/id values in this codebase.
      //  - react-hooks/set-state-in-effect flags the standard client-only-data
      //    pattern (`useEffect(() => setX(browserOnlyCheck()), [])`) used here for
      //    SSR-safe hydration guards and WebGL/SpeechRecognition feature detection —
      //    there is no purely-render-time alternative for reading `window`/`navigator`
      //    in a server-rendered app.
      // Revisit if/when React Compiler is turned on for this project.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The native Android project (Capacitor) — Gradle build intermediates
    // under android/**/build/ bundle third-party/generated JS (the Cordova
    // bridge, Capacitor's own native-bridge.js) that isn't this project's
    // source and was never meant to be linted against this app's rules.
    // Kotlin sources under android/app/src aren't JS/TS either way, so
    // this whole tree has nothing for this config to check.
    "android/**",
  ]),
]);

export default eslintConfig;
