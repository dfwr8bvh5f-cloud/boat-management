import { defineConfig, devices } from "@playwright/test";

// Browser-based review/e2e tests need a real running app + demo credentials
// - neither is assumed to exist. BASE_URL/DEMO_USER_EMAIL/DEMO_USER_PASSWORD
// must be set (see .env.local.example) or these tests fail fast with a clear
// message instead of hanging on a login form that can never succeed.
const baseURL = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
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
