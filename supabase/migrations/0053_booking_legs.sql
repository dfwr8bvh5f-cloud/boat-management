-- ============================================================================
-- Trip legs: an owner-use trip (or any trip on a private boat) can visit
-- several destinations in one outing. Each leg has its own destination/ports
-- and its own guest list - trip dates stay at the booking level.
-- ============================================================================

create table if not exists public.booking_legs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  leg_number int not null,
  destination text,
  departure_port text,
  arrival_port text,
  notes text,
  created_at timestamptz not null default now(),
  unique (booking_id, leg_number)
);

create index if not exists booking_legs_booking_id_idx on public.booking_legs (booking_id);
create index if not exists booking_legs_boat_id_idx on public.booking_legs (boat_id);

alter table public.booking_legs enable row level security;

-- Mirrors booking_guests_select/write exactly (0004_bookings_upgrade.sql).
drop policy if exists booking_legs_select on public.booking_legs;
create policy booking_legs_select on public.booking_legs for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (
      public.current_role() = 'owner' and boat_id = public.current_boat_id()
      and exists (select 1 from public.bookings b where b.id = booking_id and b.status = 'approved')
    )
  );

drop policy if exists booking_legs_write on public.booking_legs;
create policy booking_legs_write on public.booking_legs for all
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()))
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

-- Nullable: existing guests keep leg_id = null ("trip-level", pre-migration
-- data) and keep displaying exactly as before - new guests can optionally
-- be attached to a specific leg going forward.
alter table public.booking_guests add column if not exists leg_id uuid references public.booking_legs(id) on delete cascade;
create index if not exists booking_guests_leg_id_idx on public.booking_guests (leg_id);
