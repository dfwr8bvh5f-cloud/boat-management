// Complete inventory of the app's routes, generated from src/app/**/page.tsx
// (see the `find src/app -name page.tsx` command used to build this) - kept
// as a plain data file so it's easy to diff when a new page is added, and so
// "list of pages reviewed" in the final report is always accurate rather
// than whatever a crawl happened to reach.

export const FLEET_WIDE_ROUTES = ["/boats", "/approvals", "/issues", "/technicians", "/users"] as const;

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
  "/boats/{boatId}/finance/invoices",
  "/boats/{boatId}/finance/report",
  "/boats/{boatId}/maintenance",
  "/boats/{boatId}/maintenance/issues",
  "/boats/{boatId}/maintenance/reports",
  "/boats/{boatId}/maintenance/specs",
  "/boats/{boatId}/staff",
  "/boats/{boatId}/store",
  "/boats/{boatId}/store/shopping",
  "/boats/{boatId}/store/transfer",
] as const;

// Reachable without a session - reviewed separately since design/UX
// expectations differ from the authenticated app (no nav chrome, etc).
export const UNAUTHENTICATED_ROUTES = ["/login", "/forgot-password"] as const;

export function resolveBoatRoutes(boatId: string): string[] {
  return PER_BOAT_ROUTES.map((route) => route.replace("{boatId}", boatId));
}
