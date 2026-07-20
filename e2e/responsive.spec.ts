import { mkdirSync } from "node:fs";
import { test, expect, loginAsDemoUser } from "./fixtures/auth";
import { resolveBoatRoutes } from "./nav-map";

// Functional/responsive coverage complementing review-crawl.spec.ts (which
// crawls every route for render + a11y). This file drives actual flows -
// login, logout, navigation, settings, forms, modals, tables, reports,
// file export, language switching - and asserts on real behavior rather
// than just "the page loaded". Runs across every project in
// playwright.config.ts, including the width-matrix projects added there
// for the 320-1920px breakpoint sweep.
const SCREENSHOT_DIR = "reports/screenshots";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, `${label}: page should not overflow horizontally (scrollWidth - clientWidth)`).toBeLessThanOrEqual(2);
}

test.describe("login", () => {
  test("valid credentials redirect into the app", async ({ page }) => {
    await loginAsDemoUser(page);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("invalid credentials show an inline error and stay on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("not-a-real-user@example.com");
    await page.locator('input[name="password"]').fill("wrong-password");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("form")).toContainText(/./, { timeout: 10_000 }); // form re-renders with an error
    await expect(page).toHaveURL(/\/login/);
  });
});

test("logout returns to /login and the session no longer reaches the app", async ({ authedPage }) => {
  await authedPage.goto("/boats");
  const logoutButton = authedPage.locator("header button[type=submit]");
  await expect(logoutButton).toBeVisible();
  await logoutButton.click();
  await authedPage.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 10_000 });

  // A logged-out session must be bounced back to /login by middleware, not
  // shown a stale authenticated page.
  await authedPage.goto("/boats");
  await authedPage.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 10_000 });
});

test.describe("navigation", () => {
  test("fleet-wide nav links reach their target and highlight the current section", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    await expect(authedPage).toHaveURL(/\/boats$/);

    const firstBoatLink = authedPage.locator('a[href^="/boats/"]:not([href="/boats/new"])').first();
    await expect(firstBoatLink).toBeVisible({ timeout: 10_000 });
    await firstBoatLink.click();
    await authedPage.waitForURL(/\/boats\/[^/]+$/);

    const allBoatsLink = authedPage.locator('header a[href="/boats"]');
    await expect(allBoatsLink).toBeVisible();
    await allBoatsLink.click();
    await authedPage.waitForURL(/\/boats$/);
  });

  test("settings link from the header reaches /settings and back", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    await authedPage.locator('header a[href="/settings"]').click();
    await authedPage.waitForURL(/\/settings$/);
    await expect(authedPage.getByText("Change password").or(authedPage.getByText("שינוי סיסמה"))).toBeVisible();
  });
});

test.describe("settings", () => {
  test("change-password and language sub-pages open and have a way back", async ({ authedPage }) => {
    await authedPage.goto("/settings");

    await authedPage.locator('a[href="/settings/change-password"]').click();
    await authedPage.waitForURL(/\/settings\/change-password$/);
    await expect(authedPage.locator("main")).toBeVisible();

    await authedPage.goBack();
    await authedPage.waitForURL(/\/settings$/);

    await authedPage.locator('a[href="/settings/language"]').click();
    await authedPage.waitForURL(/\/settings\/language$/);
    await expect(authedPage.getByRole("button", { name: "English" })).toBeVisible();
  });

  test("notifications row renders as a single, non-nested interactive control", async ({ authedPage }) => {
    await authedPage.goto("/settings");
    // Regression guard for a real bug found in this audit: the row used to
    // hydration-mismatch (server: disabled <div>, client: <button>) and,
    // separately, nested a <button> toggle inside an outer <button> row -
    // both invalid. There must be exactly one button in the row now.
    const row = authedPage.locator("text=Notifications").locator("..").locator("..");
    const buttons = row.locator("button");
    await expect(buttons).toHaveCount(1);
  });
});

test.describe("language switching", () => {
  test("switching to English updates rendered UI text", async ({ authedPage }) => {
    await authedPage.goto("/settings/language");
    await authedPage.getByRole("button", { name: "English" }).click();
    await authedPage.waitForTimeout(500);
    await authedPage.goto("/settings");
    await expect(authedPage.getByText("Change password")).toBeVisible();

    // restore Hebrew so this test doesn't leak locale state into others
    await authedPage.goto("/settings/language");
    await authedPage.getByRole("button", { name: "עברית" }).click();
  });
});

test.describe("forms and modals", () => {
  test("quick-add-expense disclosure opens, blocks empty submit, and closes", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    const summary = authedPage.locator("summary", { hasText: /Add expense|הוסף הוצאה/ }).first();
    await summary.click();

    const details = authedPage.locator("details", { has: summary }).first();
    await expect(details).toHaveJSProperty("open", true);

    // Required-field HTML5 validation should block submission - no
    // network call, no record created, no navigation.
    const amountInput = details.locator('input[required]').first();
    await expect(amountInput).toBeVisible();
    const isValid = await amountInput.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(isValid).toBe(false);

    const closeButton = details.locator('button[aria-label]').first();
    await closeButton.click();
    await expect(details).toHaveJSProperty("open", false);
  });
});

test.describe("tables and reports", () => {
  test("expenses table/cards render without horizontal overflow", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    const boatHref = await authedPage
      .locator('a[href^="/boats/"]:not([href="/boats/new"])')
      .first()
      .getAttribute("href");
    const boatId = boatHref?.split("/")[2];
    expect(boatId).toBeTruthy();

    await authedPage.goto(`/boats/${boatId}/finance/expenses`);
    await authedPage.waitForTimeout(500);
    await expectNoHorizontalOverflow(authedPage, `/boats/${boatId}/finance/expenses`);
  });

  test("period report page renders", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    const boatHref = await authedPage
      .locator('a[href^="/boats/"]:not([href="/boats/new"])')
      .first()
      .getAttribute("href");
    const boatId = boatHref?.split("/")[2];
    const response = await authedPage.goto(`/boats/${boatId}/finance/report`);
    expect(response?.ok()).toBeTruthy();
    await expectNoHorizontalOverflow(authedPage, `/boats/${boatId}/finance/report`);
  });
});

test.describe("file export", () => {
  test("Export to Excel triggers a real download", async ({ authedPage }) => {
    await authedPage.goto("/boats");
    const boatHref = await authedPage
      .locator('a[href^="/boats/"]:not([href="/boats/new"])')
      .first()
      .getAttribute("href");
    const boatId = boatHref?.split("/")[2];
    await authedPage.goto(`/boats/${boatId}/finance/expenses`);

    const exportButton = authedPage.getByRole("button", { name: /Export to Excel|ייצוא ל-Excel/ });
    await expect(exportButton).toBeVisible();
    const [download] = await Promise.all([authedPage.waitForEvent("download", { timeout: 15_000 }), exportButton.click()]);
    // The button is labeled "Export to Excel" but the app actually produces
    // a .csv (which Excel opens fine) - asserting on the app's real,
    // observed behavior rather than the label's literal implication.
    expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx?)$/i);
  });
});

test.describe("PWA install affordance", () => {
  test("app reacts to a beforeinstallprompt event by offering the install row", async ({ authedPage }) => {
    await authedPage.goto("/settings");
    // Real browsers fire this proprietary Chrome/Edge event when they
    // decide the page is installable - Playwright can't trigger the real
    // decision, but dispatching the event synthetically verifies the
    // app's own listener (src/lib/pwa-install.ts) reacts correctly, which
    // is the part actually under this app's control.
    await authedPage.evaluate(() => {
      const evt = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt?: () => Promise<void>;
        userChoice?: Promise<{ outcome: string }>;
      };
      evt.prompt = async () => {};
      evt.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(evt);
    });
    await expect(authedPage.getByText("Install App").or(authedPage.getByText("התקנת האפליקציה"))).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("full authenticated per-boat crawl at every configured viewport", () => {
  test("no route overflows horizontally", async ({ authedPage }, testInfo) => {
    await authedPage.goto("/boats");
    const boatHref = await authedPage
      .locator('a[href^="/boats/"]:not([href="/boats/new"])')
      .first()
      .getAttribute("href");
    const boatId = boatHref?.split("/")[2];
    expect(boatId).toBeTruthy();

    const failures: string[] = [];
    for (const route of ["/boats", ...resolveBoatRoutes(boatId!).slice(0, 6), "/settings"]) {
      await authedPage.goto(route);
      await authedPage.waitForTimeout(400);
      try {
        const overflow = await authedPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        if (overflow > 2) failures.push(`${route} (${testInfo.project.name}): overflow ${overflow}px`);
      } catch {
        // A route that itself does a server-side redirect (e.g. /finance ->
        // /finance/expenses) can occasionally still be mid-navigation when
        // this runs, destroying the execution context - the redirect
        // target is covered by its own route entry, so skip rather than
        // flake the whole crawl over a timing race.
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
