-- ============================================================================
-- Trip preparation: shopping lists and transfer (taxi/van) requests.
--
-- Unlike every other module, the *owner* is the one who requests things
-- here (provisions, airport transfers) and management fulfils them -
-- matching the source app exactly. So this is the one place where owner
-- gets write access (create/delete requests, and check off shopping items
-- alongside the captain) rather than read-only.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'shopping_unit') then
    create type public.shopping_unit as enum ('pcs', 'kg', 'g', 'l', 'ml', 'pack');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transfer_vehicle') then
    create type public.transfer_vehicle as enum ('van', 'taxi');
  end if;
end $$;

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  title text not null,
  booking_id uuid references public.bookings (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit public.shopping_unit not null default 'pcs',
  photo_path text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shopping_lists_boat_id_idx on public.shopping_lists (boat_id);
create index if not exists shopping_list_items_list_id_idx on public.shopping_list_items (list_id);
create index if not exists shopping_list_items_boat_id_idx on public.shopping_list_items (boat_id);

create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  people_count int not null default 1,
  flight_number text,
  transfer_date date not null default current_date,
  landing_time time,
  vehicle public.transfer_vehicle not null default 'van',
  pickup text not null,
  dropoff text not null,
  notes text,
  arranged boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transfer_requests_boat_id_idx on public.transfer_requests (boat_id);

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.transfer_requests enable row level security;

-- shopping_lists / shopping_list_items: everyone on the boat can see and
-- check items off; only management or the owner can create/delete a list.
do $$
declare
  t text;
begin
  foreach t in array array['shopping_lists', 'shopping_list_items']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_management() or boat_id = public.current_boat_id());',
      t, t
    );

    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_management() or (public.current_role() = ''owner'' and boat_id = public.current_boat_id()));',
      t, t
    );

    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.is_management() or boat_id = public.current_boat_id()) with check (public.is_management() or boat_id = public.current_boat_id());',
      t, t
    );

    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_management() or (public.current_role() = ''owner'' and boat_id = public.current_boat_id()));',
      t, t
    );
  end loop;
end $$;

-- transfer_requests: owner/management create + delete; only management can
-- mark a request as arranged (that's the only thing UPDATE is used for).
drop policy if exists transfer_requests_select on public.transfer_requests;
create policy transfer_requests_select on public.transfer_requests for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists transfer_requests_insert on public.transfer_requests;
create policy transfer_requests_insert on public.transfer_requests for insert
  with check (public.is_management() or (public.current_role() = 'owner' and boat_id = public.current_boat_id()));

drop policy if exists transfer_requests_update on public.transfer_requests;
create policy transfer_requests_update on public.transfer_requests for update
  using (public.is_management())
  with check (public.is_management());

drop policy if exists transfer_requests_delete on public.transfer_requests;
create policy transfer_requests_delete on public.transfer_requests for delete
  using (public.is_management() or (public.current_role() = 'owner' and boat_id = public.current_boat_id()));

-- ----------------------------------------------------------------------------
-- Storage: private bucket for shopping item reference photos.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('shopping', 'shopping', false)
on conflict (id) do nothing;

drop policy if exists shopping_storage_select on storage.objects;
create policy shopping_storage_select on storage.objects for select
  using (
    bucket_id = 'shopping'
    and (public.is_management() or (storage.foldername(name))[1] = public.current_boat_id()::text)
  );

drop policy if exists shopping_storage_insert on storage.objects;
create policy shopping_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'shopping'
    and (
      public.is_management()
      or (
        public.current_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists shopping_storage_delete on storage.objects;
create policy shopping_storage_delete on storage.objects for delete
  using (
    bucket_id = 'shopping'
    and (
      public.is_management()
      or (
        public.current_role() = 'owner'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
