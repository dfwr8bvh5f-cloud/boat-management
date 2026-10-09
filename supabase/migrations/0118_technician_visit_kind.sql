-- ============================================================================
-- Shipyard jobs on the technical manager's calendar. A multi-day job at a
-- shipyard is stored as a technician_visits row like any other visit (same
-- date range, boats and location), distinguished only by this new column so
-- the calendar can draw its start/end days as noon half-days. Additive only:
-- every existing row defaults to 'visit', no data is changed or removed.
-- ============================================================================

alter table public.technician_visits
  add column if not exists kind text not null default 'visit';

alter table public.technician_visits
  drop constraint if exists technician_visits_kind_check;
alter table public.technician_visits
  add constraint technician_visits_kind_check check (kind in ('visit', 'shipyard'));
