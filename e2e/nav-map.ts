// Complete inventory of the app's routes, generated from src/app/**/page.tsx
// (see the `find src/app -name page.tsx` command used to build this) - kept
// as a plain data file so it's easy to diff when a new page is added, and so
// "list of pages reviewed" in the final report is always accurate rather
// than whatever a crawl happened to reach.

export const FLEET_WIDE_ROUTES = [
  "/boats",
  "/boats/new",
  "/approvals",
  "/issues",
  "/technicians",
  "/users",
  "/settings",
  "/settings/language",
  "/settings/change-password",
  "/settings/demo-visits",
  "/technical",
  "/technical/calendar",
  "/technical/issues",
  "/technical/technicians",
  // The MYS area (management-only) - was missing from this map entirely.
  "/mys",
  "/mys/bank-reconciliation",
  "/mys/clients",
  "/mys/commissions",
  "/mys/debts",
  "/mys/expenses",
  "/mys/income",
  "/mys/invoices",
  "/mys/salaries",
] as const;

// Templated with {boatId} - resolved at test-run time to the demo account's
// actual boat(s), never hardcoded, since a boat id is real account data.
export const PER_BOAT_ROUTES = [
  "/boats/{boatId}",
  "/boats/{boatId}/bookings",
  "/boats/{boatId}/catalog",
  "/boats/{boatId}/documents",
  "/boats/{boatId}/finance",
  "/boats/{boatId}/finance/bank",
  "/boats/{boatId}/finance/bank-reconciliation",
  "/boats/{boatId}/finance/budget",
  "/boats/{boatId}/finance/cash",
  "/boats/{boatId}/finance/expenses",
  "/boats/{boatId}/finance/future",
  "/boats/{boatId}/finance/periodic-reports",
  "/boats/{boatId}/finance/report",
  "/boats/{boatId}/finance/report/owner-trip",
  "/boats/{boatId}/maintenance",
  "/boats/{boatId}/maintenance/inventory",
  "/boats/{boatId}/maintenance/issues",
  "/boats/{boatId}/maintenance/reports",
  "/boats/{boatId}/maintenance/specs",
  "/boats/{boatId}/staff",
] as const;

// Real pages the crawl deliberately does not visit, because they need a
// record id or a one-time token that can't be guessed: kept here (instead
// of silently missing) so src/lib/nav-map.test.ts can tell "intentionally
// skipped" apart from "someone added a page and forgot the map".
export const NOT_CRAWLED_ROUTES = [
  "/",
  "/reset-password",
  "/boats/{boatId}/bookings/{bookingId}/manifest",
  "/mys/debts/statement/{boatId}",
  "/mys/debts/statement/client/{name}",
  "/mys/invoices/{id}",
] as const;

// Reachable without a session - reviewed separately since design/UX
// expectations differ from the authenticated app (no nav chrome, etc).
export const UNAUTHENTICATED_ROUTES = ["/login", "/forgot-password"] as const;

export function resolveBoatRoutes(boatId: string): string[] {
  return PER_BOAT_ROUTES.map((route) => route.replace("{boatId}", boatId));
}
