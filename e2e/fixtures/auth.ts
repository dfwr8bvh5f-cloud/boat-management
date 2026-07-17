import { test as base, expect, type Page } from "@playwright/test";

// Fails fast with a clear, actionable message rather than letting a login
// form time out mysteriously when the demo environment isn't configured -
// see .env.local.example for the three variables this needs.
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
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginAsDemoUser(page);
    await use(page);
  },
});

export { expect };
