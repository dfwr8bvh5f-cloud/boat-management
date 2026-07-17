import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/auth";
import { FLEET_WIDE_ROUTES, UNAUTHENTICATED_ROUTES, resolveBoatRoutes } from "./nav-map";

// Screenshots/traces are the raw material the design/UX/accessibility
// subagents review afterwards - written under reports/ (gitignored, see
// .gitignore) so real demo-account content never lands in a commit.
const SCREENSHOT_DIR = "reports/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const VIEWPORT_LABEL: Record<string, string> = {
  "desktop-chromium": "desktop",
  tablet: "tablet",
  mobile: "mobile",
};

function screenshotPath(route: string, projectName: string): string {
  const safeName = route.replace(/\//g, "_").replace(/[{}]/g, "") || "root";
  const viewport = VIEWPORT_LABEL[projectName] ?? projectName;
  return `${SCREENSHOT_DIR}/${viewport}${safeName}.png`;
}

for (const route of UNAUTHENTICATED_ROUTES) {
  test(`unauthenticated: ${route} renders and passes an automated a11y scan`, async ({ page }, testInfo) => {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should respond with a 2xx status`).toBeTruthy();
    await page.screenshot({ path: screenshotPath(route, testInfo.project.name), fullPage: true });

    const results = await new AxeBuilder({ page }).analyze();
    // Not a hard failure by default - accessibility issues are collected as
    // findings for the report (severity classification happens in the
    // subagent review step), not treated as a build-breaking test failure,
    // matching this project's "generate findings, don't silently block" model.
    await testInfo.attach("axe-violations", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });
  });
}

test.describe("authenticated crawl", () => {
  test("fleet-wide pages render, capture screenshots, and pass an automated a11y scan", async ({
    authedPage,
  }, testInfo) => {
    for (const route of FLEET_WIDE_ROUTES) {
      const response = await authedPage.goto(route);
      expect(response?.ok(), `${route} should respond with a 2xx status`).toBeTruthy();
      await authedPage.screenshot({ path: screenshotPath(route, testInfo.project.name), fullPage: true });

      const results = await new AxeBuilder({ page: authedPage }).analyze();
      await testInfo.attach(`axe-violations${route.replace(/\//g, "_")}`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
    }
  });

  test("every per-boat page for the demo account's first boat renders and passes an a11y scan", async ({
    authedPage,
  }, testInfo) => {
    await authedPage.goto("/boats");
    // The demo account's boats are real (if fake) data, discovered live
    // rather than hardcoded - a boat id must never be assumed/guessed.
    const firstBoatLink = authedPage.locator('a[href^="/boats/"]:not([href="/boats/new"])').first();
    await expect(firstBoatLink, "demo account needs at least one boat to crawl its per-boat pages").toBeVisible({
      timeout: 10_000,
    });
    const href = await firstBoatLink.getAttribute("href");
    const boatId = href?.split("/")[2];
    expect(boatId, "could not extract a boat id from the fleet list").toBeTruthy();

    for (const route of resolveBoatRoutes(boatId!)) {
      const response = await authedPage.goto(route);
      expect(response?.ok(), `${route} should respond with a 2xx status`).toBeTruthy();
      await authedPage.screenshot({ path: screenshotPath(route, testInfo.project.name), fullPage: true });

      const results = await new AxeBuilder({ page: authedPage }).analyze();
      await testInfo.attach(`axe-violations${route.replace(/\//g, "_")}`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: "application/json",
      });
    }
  });
});
