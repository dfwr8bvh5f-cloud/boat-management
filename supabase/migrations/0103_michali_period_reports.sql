-- ============================================================================
-- Saved snapshots of the MICHALI-only "periodic report" calculator (see
-- src/components/michali-period-report.tsx / src/lib/michali-period-report.ts).
-- Deliberately its own table rather than a third `reports.type` value -
-- the snapshot shape (fuel/boat-service/provisions/docking) has nothing in
-- common with the existing financial/technical report snapshots, and this
-- feature only ever applies to one boat.
--
-- Unlike `reports` (management-authored only), insert is allowed for the
-- boat's own crew too - the captain is the one who fills in fuel/provisions/
-- etc. and is expected to save the report themselves. Update/delete stay
-- management-only, matching every other report's edit/delete protection.
-- ============================================================================

create table if not exists public.michali_period_reports (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  period_start date,
  period_end date,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists michali_period_reports_boat_id_idx on public.michali_period_reports (boat_id);

alter table public.michali_period_reports enable row level security;

drop policy if exists michali_period_reports_select on public.michali_period_reports;
create policy michali_period_reports_select on public.michali_period_reports for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists michali_period_reports_insert on public.michali_period_reports;
create policy michali_period_reports_insert on public.michali_period_reports for insert
  with check (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists michali_period_reports_update on public.michali_period_reports;
create policy michali_period_reports_update on public.michali_period_reports for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists michali_period_reports_delete on public.michali_period_reports;
create policy michali_period_reports_delete on public.michali_period_reports for delete
  using (public.is_management());
