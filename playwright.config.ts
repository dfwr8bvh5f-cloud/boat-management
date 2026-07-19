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
    // Opt-in only: some sandboxes have a browser binary pre-installed at a
    // fixed path that doesn't match the exact revision this pinned
    // @playwright/test version expects to download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
    // blocks fetching the matching one). Unset anywhere else, so normal
    // environments keep Playwright's default browser resolution untouched.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
    { name: "mobile-android", use: { ...devices["Pixel 7"] } },
    // Explicit breakpoint sweep (plain viewport resize, desktop Chrome UA,
    // no touch) - the widths called out in the responsive-design audit.
    // Only e2e/responsive.spec.ts runs against these; review-crawl.spec.ts
    // stays on the three named projects above (its screenshot naming
    // assumes those).
    ...[320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920].map((width) => ({
      name: `width-${width}`,
      use: {
        viewport: { width, height: width < 700 ? 800 : width < 1100 ? 1024 : 900 },
      },
      testMatch: /responsive\.spec\.ts/,
    })),
  ],
});
