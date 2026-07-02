-- ============================================================================
-- Bookings upgrade: replace the old booking lifecycle status with the same
-- real approval workflow used by expenses/issues, add usage type + guest
-- count + sailing area, and add a guest passport list per booking.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'usage_type') then
    create type public.usage_type as enum ('owner', 'charter', 'exhibition');
  end if;
end $$;

-- Drop the old ad-hoc lifecycle status in favour of the shared approval_status.
alter table public.bookings drop column if exists status;
drop type if exists public.booking_status;

alter table public.bookings
  add column if not exists status public.approval_status not null default 'pending',
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists usage_type public.usage_type not null default 'charter',
  add column if not exists guests_count int,
  add column if not exists sailing_area text;

drop trigger if exists prevent_self_approval on public.bookings;
create trigger prevent_self_approval before update on public.bookings
  for each row execute function public.prevent_self_approval();

-- Re-create bookings RLS to match the approval-aware pattern (management
-- full access, captain full access on their boat, owner sees approved only).
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (public.current_role() = 'owner' and boat_id = public.current_boat_id() and status = 'approved')
  );

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- ----------------------------------------------------------------------------
-- Guest passports per booking.
-- ----------------------------------------------------------------------------
create table if not exists public.booking_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  name text not null,
  passport_number text,
  nationality text,
  date_of_birth date,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists booking_guests_booking_id_idx on public.booking_guests (booking_id);
create index if not exists booking_guests_boat_id_idx on public.booking_guests (boat_id);

alter table public.booking_guests enable row level security;

-- A guest is visible/editable under the same rule as its parent booking.
drop policy if exists booking_guests_select on public.booking_guests;
create policy booking_guests_select on public.booking_guests for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (
      public.current_role() = 'owner' and boat_id = public.current_boat_id()
      and exists (select 1 from public.bookings b where b.id = booking_id and b.status = 'approved')
    )
  );

drop policy if exists booking_guests_write on public.booking_guests;
create policy booking_guests_write on public.booking_guests for all
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- ----------------------------------------------------------------------------
-- Storage: private bucket for guest passport photos.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('booking-guests', 'booking-guests', false)
on conflict (id) do nothing;

drop policy if exists booking_guests_storage_select on storage.objects;
create policy booking_guests_storage_select on storage.objects for select
  using (
    bucket_id = 'booking-guests'
    and (
      public.is_management()
      or exists (
        select 1 from public.booking_guests g
        join public.bookings b on b.id = g.booking_id
        where g.photo_path = storage.objects.name
          and g.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or b.status = 'approved')
      )
    )
  );

drop policy if exists booking_guests_storage_insert on storage.objects;
create policy booking_guests_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'booking-guests'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists booking_guests_storage_delete on storage.objects;
create policy booking_guests_storage_delete on storage.objects for delete
  using (
    bucket_id = 'booking-guests'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
