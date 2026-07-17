import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Unlike Next.js (which auto-loads .env.local for `next dev`/`next build`),
// a standalone `playwright test` process does NOT read it on its own - this
// must run before anything below touches process.env.BASE_URL etc., or
// every var reads as unset even when .env.local has real values in it.
// quiet: true - dotenv 17.x prints a promotional banner to stdout by
// default on every load, which both clutters test output and breaks
// machine-readable reporters (e.g. --reporter=json) that expect stdout to
// be pure JSON.
loadEnv({ path: ".env.local", quiet: true });

// Browser-based review/e2e tests need a real running app + demo credentials
// - neither is assumed to exist, and this project has hit environments
// (its own sandboxed dev session included) whose network policy blocks the
// connection outright. globalSetup checks env vars + actual reachability
// ONCE per run and every spec skips itself cleanly (with the real reason)
// via the beforeEach in e2e/fixtures/auth.ts if either is missing - so this
// suite auto-adapts to wherever it's run instead of needing manual toggling.
const baseURL = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false, // sequential: most flows depend on a shared demo-account session
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { outputFolder: "reports/playwright-html", open: "never" }], ["list"]],
  outputDir: "reports/playwright-artifacts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Never let a credential leak into a trace/video file.
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
});
