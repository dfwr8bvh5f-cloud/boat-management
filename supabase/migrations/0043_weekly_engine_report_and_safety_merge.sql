-- ============================================================================
-- Weekly engine/generator/watermaker hours + fuel tank status report,
-- filled by the captain once a week (Friday). One row per boat per
-- reporting week, keyed by the Friday date of that week.
-- ============================================================================
create table if not exists public.weekly_engine_reports (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  week_of date not null,
  main_engine_hours numeric,
  generator_main_hours numeric,
  generator_secondary_hours numeric,
  watermaker_hours numeric,
  fuel_status text,
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boat_id, week_of)
);

create index if not exists weekly_engine_reports_boat_id_idx on public.weekly_engine_reports (boat_id);

drop trigger if exists set_updated_at on public.weekly_engine_reports;
create trigger set_updated_at before update on public.weekly_engine_reports
  for each row execute function public.set_updated_at();

alter table public.weekly_engine_reports enable row level security;

drop policy if exists weekly_engine_reports_select on public.weekly_engine_reports;
create policy weekly_engine_reports_select on public.weekly_engine_reports for select
  using (
    public.is_management()
    or (public.current_role() in ('captain', 'owner') and boat_id = public.current_boat_id())
  );

drop policy if exists weekly_engine_reports_insert on public.weekly_engine_reports;
create policy weekly_engine_reports_insert on public.weekly_engine_reports for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists weekly_engine_reports_update on public.weekly_engine_reports;
create policy weekly_engine_reports_update on public.weekly_engine_reports for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists weekly_engine_reports_delete on public.weekly_engine_reports;
create policy weekly_engine_reports_delete on public.weekly_engine_reports for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- ============================================================================
-- Safety equipment merges into Technical Specs as a category, instead of
-- being its own sub-tab backed by the `documents` table. Per explicit
-- instruction, existing safety-equipment document rows are deleted (not
-- migrated) - the "Safety equipment" tab and its data go away together.
-- ============================================================================
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a DO/PL-pgSQL block, so
-- this must stay a plain top-level statement (IF NOT EXISTS makes it safe
-- to re-run) - same constraint as migration 0003.
alter type public.technical_spec_category add value if not exists 'safety';

delete from public.documents where doc_type = 'safety';
