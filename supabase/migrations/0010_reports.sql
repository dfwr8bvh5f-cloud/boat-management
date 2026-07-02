-- ============================================================================
-- Monthly reports: management issues a frozen financial or technical
-- snapshot for a given month, visible to captain/owner. The snapshot is
-- stored as JSON at issue time so it doesn't change if the underlying
-- expenses/issues are edited later - it's a point-in-time communication,
-- not a live view.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_type') then
    create type public.report_type as enum ('financial', 'technical');
  end if;
end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  type public.report_type not null,
  month text not null,
  snapshot jsonb not null default '{}'::jsonb,
  issued_by uuid references public.profiles (id) on delete set null,
  issued_at timestamptz not null default now()
);

create index if not exists reports_boat_id_idx on public.reports (boat_id);

alter table public.reports enable row level security;

-- Management authors reports; captain/owner just read them (no approval
-- concept - management is the sole author by design).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists reports_write on public.reports;
create policy reports_write on public.reports for all
  using (public.is_management())
  with check (public.is_management());
