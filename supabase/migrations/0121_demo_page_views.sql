-- ============================================================================
-- Logs each page the public demo account (src/app/demo/route.ts) visits, so
-- management can see where a shared-link visitor actually looked and what
-- they focused on. Rows are grouped into one browsing visit by visit_id (a
-- random id minted once per sign-in and carried in a cookie - see
-- src/lib/supabase/middleware.ts). Only ever written by the admin client
-- (service role, bypassing RLS) from middleware, and only ever read by the
-- management-only /settings/demo-visits page via the same admin client -
-- same pattern push_subscribers' own management overview already uses, so
-- no RLS policy is needed here at all.
-- ============================================================================

create table if not exists public.demo_page_views (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  path text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists demo_page_views_visit_id_idx on public.demo_page_views (visit_id, viewed_at);
create index if not exists demo_page_views_viewed_at_idx on public.demo_page_views (viewed_at desc);

alter table public.demo_page_views enable row level security;
-- No policies: this table is only ever touched by the service-role admin
-- client (see comment above), so default-deny RLS is exactly right - it
-- blocks every ordinary authenticated role, including the demo account
-- itself, from reading or writing it directly.
