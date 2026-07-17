// Whether the live-browser phase can run at all in the current environment.
// This is checked once (see globalSetup in playwright.config.ts) rather
// than per-test, since it's the same answer for every test in the run and
// a network probe per test would just slow everything down identically.
//
// Any actual HTTP response (even a 4xx/5xx from the app itself) counts as
// reachable - the only thing being tested is whether the connection is
// allowed at all. The one exception: some sandboxed environments (this
// project's own dev session included) intercept outbound connections to
// non-allowlisted hosts and answer with a structured HTTP-level denial
// instead of a connection failure, so a naive client sees what looks like a
// normal response. That denial is identifiable by an `x-deny-reason`
// response header - confirmed by directly inspecting the response from
// this exact BASE_URL in this exact environment, where curl/Playwright's
// browser (which both do use the configured proxy for the HTTPS CONNECT)
// get a connection-level 403 at the tunnel, while Node's own fetch() (which
// does not automatically route through HTTPS_PROXY) instead reaches
// whatever is transparently intercepting the connection and gets back this
// same 403 as a "successful" HTTP response - without this check, that would
// be misread as the app being reachable.
export async function isBaseUrlReachable(): Promise<{ reachable: boolean; reason: string }> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) {
    return { reachable: false, reason: "BASE_URL is not set in .env.local" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(baseURL, { signal: controller.signal, redirect: "manual" });
    const denyReason = res.headers.get("x-deny-reason");
    if (denyReason) {
      const body = await res.text().catch(() => "");
      return {
        reachable: false,
        reason:
          `This environment's network policy is blocking outbound access to ${baseURL} ` +
          `(${denyReason}): ${body || "no further detail from the policy responder"}. ` +
          `This is an environment/network-egress setting, not an application bug - see ` +
          `code.claude.com/docs/en/claude-code-on-the-web for how environment network ` +
          `policies are configured.`,
      };
    }
    return { reachable: true, reason: "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      reachable: false,
      reason: `Could not reach ${baseURL}: ${message} - this environment's network policy is likely blocking the connection (not an application bug). See README.md testing section.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
