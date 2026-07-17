import { isBaseUrlReachable } from "./fixtures/network";

// Runs once before the whole e2e run. Decides whether the live-browser
// phase can proceed at all, and writes that decision to env vars the
// individual spec files read in a beforeEach skip-check - this is what
// makes `npm run test:e2e` / the /review-app command self-adapting: point
// it at a reachable BASE_URL with real demo credentials and it runs for
// real, point it at nothing (or an unreachable one, like this project's own
// sandboxed dev session) and it skips cleanly with the actual reason
// instead of hanging or failing loudly.
export default async function globalSetup() {
  const missingVars = ["BASE_URL", "DEMO_USER_EMAIL", "DEMO_USER_PASSWORD"].filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    process.env.PLAYWRIGHT_NETWORK_READY = "false";
    process.env.PLAYWRIGHT_SKIP_REASON = `Live browser phase skipped: ${missingVars.join(", ")} not set in .env.local.`;
    return;
  }

  const { reachable, reason } = await isBaseUrlReachable();
  process.env.PLAYWRIGHT_NETWORK_READY = String(reachable);
  process.env.PLAYWRIGHT_SKIP_REASON = reachable ? "" : `Live browser phase skipped: ${reason}`;
}
