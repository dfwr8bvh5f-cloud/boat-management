-- ============================================================================
-- Fleet-wide technician visit calendar, for the new /technical section
-- (management only). A visit records who's coming, when (a date range, same
-- noon-to-noon-free shape as bookings isn't needed here - plain inclusive
-- date range), what time, where, and which boat(s) it concerns - one visit
-- can cover more than one boat at once, hence the separate join table
-- rather than a single boat_id column.
-- ============================================================================

create table if not exists public.technician_visits (
  id uuid primary key default gen_random_uuid(),
  -- Free text, same as issues.supplier_labour - picked from the shared
  -- technicians directory via TechnicianSelect, not a foreign key, so an
  -- old visit's record stays intact even if that technician is later
  -- renamed or removed from the directory.
  technician_name text not null,
  start_date date not null,
  end_date date not null,
  start_time time,
  location text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technician_visits_start_date_idx on public.technician_visits (start_date);

drop trigger if exists set_updated_at on public.technician_visits;
create trigger set_updated_at before update on public.technician_visits
  for each row execute function public.set_updated_at();

create table if not exists public.technician_visit_boats (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.technician_visits (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade
);

create index if not exists technician_visit_boats_visit_id_idx on public.technician_visit_boats (visit_id);
create index if not exists technician_visit_boats_boat_id_idx on public.technician_visit_boats (boat_id);

-- ----------------------------------------------------------------------------
-- Row Level Security: only management creates/edits/deletes a visit (the
-- /technical section itself is gated to profile.role = 'management' at the
-- app layer too, same as mys_* tables) - but a visit is also shown, in gray,
-- on each linked boat's own booking calendar, so a captain/owner needs read
-- access to the visits that concern their own boat, same shape as every
-- other boat-scoped table's own select policy (see 0001_init.sql).
-- ----------------------------------------------------------------------------
alter table public.technician_visits enable row level security;

drop policy if exists technician_visits_select on public.technician_visits;
create policy technician_visits_select on public.technician_visits for select
  using (
    public.is_management()
    or exists (
      select 1 from public.technician_visit_boats tvb
      where tvb.visit_id = technician_visits.id and tvb.boat_id = public.current_boat_id()
    )
  );

drop policy if exists technician_visits_insert on public.technician_visits;
create policy technician_visits_insert on public.technician_visits for insert
  with check (public.is_management());

drop policy if exists technician_visits_update on public.technician_visits;
create policy technician_visits_update on public.technician_visits for update
  using (public.is_management()) with check (public.is_management());

drop policy if exists technician_visits_delete on public.technician_visits;
create policy technician_visits_delete on public.technician_visits for delete
  using (public.is_management());

alter table public.technician_visit_boats enable row level security;

drop policy if exists technician_visit_boats_select on public.technician_visit_boats;
create policy technician_visit_boats_select on public.technician_visit_boats for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists technician_visit_boats_insert on public.technician_visit_boats;
create policy technician_visit_boats_insert on public.technician_visit_boats for insert
  with check (public.is_management());

drop policy if exists technician_visit_boats_delete on public.technician_visit_boats;
create policy technician_visit_boats_delete on public.technician_visit_boats for delete
  using (public.is_management());
