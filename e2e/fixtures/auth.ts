import { test as base, expect, type Page } from "@playwright/test";

// requiredEnv stays as a defensive fallback (e.g. a spec that forgets to
// use the `test` export below and calls loginAsDemoUser directly) - under
// normal use the beforeEach skip further down means this should never
// actually throw, since a run only reaches here once global-setup.ts has
// already confirmed BASE_URL is set and reachable and both demo-account
// vars are present.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The review agent's browser tests need BASE_URL, DEMO_USER_EMAIL, ` +
        `and DEMO_USER_PASSWORD in .env.local (gitignored, never commit these) to log into a ` +
        `real account before crawling the app.`
    );
  }
  return value;
}

export async function loginAsDemoUser(page: Page): Promise<void> {
  const email = requiredEnv("DEMO_USER_EMAIL");
  const password = requiredEnv("DEMO_USER_PASSWORD");

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Login redirects into the app on success - waiting on the URL leaving
  // /login (rather than a fixed timeout) means this fails immediately and
  // clearly if the credentials are wrong, instead of a vague timeout later.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

// A Playwright fixture that logs in once per test via the demo account -
// every test using `authedPage` instead of the built-in `page` starts
// already authenticated, without repeating the login boilerplate.
//
// Every test built on this `test` export (not just ones using `authedPage`)
// also gets the network-readiness skip below, since even the unauthenticated
// route tests need BASE_URL reachable. This is the mechanism that makes the
// whole browser phase self-adapting: run it somewhere with a reachable
// BASE_URL and real credentials and it executes for real; run it anywhere
// else (including this project's own sandboxed dev session, which has a
// network policy that blocks the connection outright) and every test skips
// itself cleanly with the real reason instead of failing or hanging.
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginAsDemoUser(page);
    await use(page);
  },
});

test.beforeEach(async ({}, testInfo) => {
  if (process.env.PLAYWRIGHT_NETWORK_READY !== "true") {
    testInfo.skip(true, process.env.PLAYWRIGHT_SKIP_REASON || "Live browser phase skipped: environment not ready.");
  }
});

export { expect };
