-- ============================================================================
-- Yacht Fleet Management - initial schema, roles & row level security
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a
-- fresh project. Safe to re-run thanks to IF NOT EXISTS / OR REPLACE guards.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('management', 'captain', 'owner');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'boat_status') then
    create type public.boat_status as enum ('active', 'maintenance', 'inactive');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'maintenance_status') then
    create type public.maintenance_status as enum ('planned', 'in_progress', 'completed');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'financial_type') then
    create type public.financial_type as enum ('income', 'expense');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum ('insurance', 'license', 'registration', 'other');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text,
  registration_number text,
  year_built int,
  length_meters numeric,
  home_port text,
  status public.boat_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profiles.id mirrors auth.users.id (1:1). role decides permissions,
-- boat_id is required for captain/owner and null for management.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'owner',
  boat_id uuid references public.boats (id) on delete set null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  title text not null,
  description text,
  status public.maintenance_status not null default 'planned',
  scheduled_date date,
  completed_date date,
  cost numeric,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  start_date date not null,
  end_date date not null,
  status public.booking_status not null default 'pending',
  price numeric,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_records (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  type public.financial_type not null,
  category text,
  amount numeric not null,
  description text,
  record_date date not null default current_date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  name text not null,
  doc_type public.document_type not null default 'other',
  file_path text not null,
  expiry_date date,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_records_boat_id_idx on public.maintenance_records (boat_id);
create index if not exists bookings_boat_id_idx on public.bookings (boat_id);
create index if not exists financial_records_boat_id_idx on public.financial_records (boat_id);
create index if not exists documents_boat_id_idx on public.documents (boat_id);
create index if not exists profiles_boat_id_idx on public.profiles (boat_id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.boats;
create trigger set_updated_at before update on public.boats
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.maintenance_records;
create trigger set_updated_at before update on public.maintenance_records
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.bookings;
create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.financial_records;
create trigger set_updated_at before update on public.financial_records
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user is created.
-- Management creates captain/owner accounts through the app's admin panel
-- (Supabase Admin API) and passes full_name / role / boat_id as user
-- metadata, which this trigger copies onto the profile row.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, boat_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'owner'),
    nullif(new.raw_user_meta_data ->> 'boat_id', '')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Helper functions used inside RLS policies.
-- SECURITY DEFINER + fixed search_path lets them read public.profiles
-- without re-triggering RLS on profiles (which would otherwise recurse).
-- ----------------------------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_boat_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select boat_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'management';
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.boats enable row level security;
alter table public.profiles enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.bookings enable row level security;
alter table public.financial_records enable row level security;
alter table public.documents enable row level security;

-- profiles: everyone can read their own row; management can read/update/delete all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_management());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_management())
  with check (id = auth.uid() or public.is_management());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete
  using (public.is_management());

-- profiles insert normally happens via the on_auth_user_created trigger
-- (security definer, bypasses RLS). This policy only matters if a row is
-- ever inserted directly through the authenticated client.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (public.is_management());

-- boats: management sees/edits everything; captain/owner only their boat.
drop policy if exists boats_select on public.boats;
create policy boats_select on public.boats for select
  using (public.is_management() or id = public.current_boat_id());

drop policy if exists boats_insert on public.boats;
create policy boats_insert on public.boats for insert
  with check (public.is_management());

drop policy if exists boats_update on public.boats;
create policy boats_update on public.boats for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and id = public.current_boat_id())
  );

drop policy if exists boats_delete on public.boats;
create policy boats_delete on public.boats for delete
  using (public.is_management());

-- Generic pattern for boat-scoped child tables:
--   select: management OR belongs to my boat (covers captain + owner)
--   insert/update/delete: management OR (captain AND belongs to my boat)
do $$
declare
  t text;
begin
  foreach t in array array['maintenance_records', 'bookings', 'financial_records', 'documents']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_management() or boat_id = public.current_boat_id());',
      t, t
    );

    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()));',
      t, t
    );

    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id())) with check (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()));',
      t, t
    );

    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()));',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Storage: private bucket for boat documents.
-- Files must be uploaded under a "<boat_id>/filename.ext" path so the
-- policies below can scope access the same way as the tables above.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      public.is_management()
      or (storage.foldername(name))[1] = public.current_boat_id()::text
    )
  );

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Bootstrap note: the very first account (yours) will be created with role
-- 'owner' by default. After signing up once, promote yourself to management
-- from the Supabase SQL editor:
--
--   update public.profiles set role = 'management', boat_id = null
--   where id = (select id from auth.users where email = 'you@example.com');
-- ----------------------------------------------------------------------------
