-- ============================================================================
-- Standalone calendar events (birthdays, holidays, etc.) - not tied to a
-- booking/trip, shown on the bookings calendar in a distinct color.
-- Same visibility/edit pattern as recurring_expenses: no approval workflow,
-- read by everyone on the boat, added/removed by management + captain.
-- ============================================================================

create table if not exists public.boat_events (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  title text not null,
  event_date date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists boat_events_boat_id_idx on public.boat_events (boat_id);

alter table public.boat_events enable row level security;

drop policy if exists boat_events_select on public.boat_events;
create policy boat_events_select on public.boat_events for select
  using (
    public.is_management()
    or boat_id = public.current_boat_id()
  );

drop policy if exists boat_events_insert on public.boat_events;
create policy boat_events_insert on public.boat_events for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists boat_events_delete on public.boat_events;
create policy boat_events_delete on public.boat_events for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );
