// Test-only stand-in for the "server-only" package (see vitest.config.mts's
// resolve.alias). That package's real implementation unconditionally
// throws unless it's imported through Next.js's own bundler, which
// enforces the server/client boundary at build time — vitest runs
// standalone Node, so the real package would fail every test that
// touches a server-only module. This alias only affects the test run;
// `next build` still uses the real "server-only" package and still
// catches an accidental client import of server-only code.
export {};
