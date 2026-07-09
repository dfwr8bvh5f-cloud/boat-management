-- ============================================================================
-- The weekly report's hour fields are no longer a fixed set (main engine,
-- main/secondary generator, watermaker) - instead, one hours entry per
-- "machine" category item from Technical Specs, so the fields on the
-- weekly report always match whatever machinery is actually on the boat.
-- The old fixed columns on weekly_engine_reports are left in place (still
-- readable, just unused going forward) rather than dropped.
-- ============================================================================
create table if not exists public.weekly_engine_report_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_engine_reports (id) on delete cascade,
  technical_spec_id uuid not null references public.technical_specs (id) on delete cascade,
  hours numeric,
  unique (report_id, technical_spec_id)
);

create index if not exists weekly_engine_report_entries_report_id_idx on public.weekly_engine_report_entries (report_id);
create index if not exists weekly_engine_report_entries_spec_id_idx on public.weekly_engine_report_entries (technical_spec_id);

alter table public.weekly_engine_report_entries enable row level security;

-- Same access shape as weekly_engine_reports itself, gated through the
-- parent report's boat_id (this table has no boat_id of its own).
drop policy if exists weekly_engine_report_entries_select on public.weekly_engine_report_entries;
create policy weekly_engine_report_entries_select on public.weekly_engine_report_entries for select
  using (
    exists (
      select 1 from public.weekly_engine_reports r
      where r.id = weekly_engine_report_entries.report_id
        and (
          public.is_management()
          or (public.current_role() in ('captain', 'owner') and r.boat_id = public.current_boat_id())
        )
    )
  );

drop policy if exists weekly_engine_report_entries_insert on public.weekly_engine_report_entries;
create policy weekly_engine_report_entries_insert on public.weekly_engine_report_entries for insert
  with check (
    exists (
      select 1 from public.weekly_engine_reports r
      where r.id = weekly_engine_report_entries.report_id
        and (
          public.is_management()
          or (public.current_role() = 'captain' and r.boat_id = public.current_boat_id())
        )
    )
  );

drop policy if exists weekly_engine_report_entries_update on public.weekly_engine_report_entries;
create policy weekly_engine_report_entries_update on public.weekly_engine_report_entries for update
  using (
    exists (
      select 1 from public.weekly_engine_reports r
      where r.id = weekly_engine_report_entries.report_id
        and (
          public.is_management()
          or (public.current_role() = 'captain' and r.boat_id = public.current_boat_id())
        )
    )
  )
  with check (
    exists (
      select 1 from public.weekly_engine_reports r
      where r.id = weekly_engine_report_entries.report_id
        and (
          public.is_management()
          or (public.current_role() = 'captain' and r.boat_id = public.current_boat_id())
        )
    )
  );

drop policy if exists weekly_engine_report_entries_delete on public.weekly_engine_report_entries;
create policy weekly_engine_report_entries_delete on public.weekly_engine_report_entries for delete
  using (
    exists (
      select 1 from public.weekly_engine_reports r
      where r.id = weekly_engine_report_entries.report_id
        and (
          public.is_management()
          or (public.current_role() = 'captain' and r.boat_id = public.current_boat_id())
        )
    )
  );
