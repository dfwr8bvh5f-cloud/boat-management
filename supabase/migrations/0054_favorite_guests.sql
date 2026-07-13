-- ============================================================================
-- Favorite guests: a per-boat address book of repeat passengers. Starring a
-- guest on a booking (or in the add-guest form) saves their passport details
-- here so they can be picked again on a future trip instead of re-typing or
-- re-scanning the same passport. Photos live in the existing booking-guests
-- storage bucket under "<boat_id>/favorites/..." - already covered by that
-- bucket's existing RLS policies (keyed only on the first path segment).
-- ============================================================================

create table if not exists public.favorite_guests (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  name text not null,
  passport_number text,
  nationality text,
  date_of_birth date,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists favorite_guests_boat_id_idx on public.favorite_guests (boat_id);

alter table public.favorite_guests enable row level security;

-- Mirrors booking_guests_write (0004_bookings_upgrade.sql) - only the roles
-- that can add guests to a booking can manage the favorites list.
drop policy if exists favorite_guests_select on public.favorite_guests;
create policy favorite_guests_select on public.favorite_guests for select
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

drop policy if exists favorite_guests_write on public.favorite_guests;
create policy favorite_guests_write on public.favorite_guests for all
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()))
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));
