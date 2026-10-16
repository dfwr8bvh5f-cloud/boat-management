// The public demo account (src/app/demo/route.ts) - shared with
// src/lib/supabase/middleware.ts, which needs the email to recognize demo
// traffic for page-view logging without an extra profile lookup on every
// request.
export const DEMO_EMAIL = process.env.DEMO_GUEST_EMAIL || "demo-guest@mysfleet-demo.com";
export const DEMO_PASSWORD = process.env.DEMO_GUEST_PASSWORD || "DemoGuest2026!";
export const DEMO_VISIT_COOKIE = "demo_visit_id";
