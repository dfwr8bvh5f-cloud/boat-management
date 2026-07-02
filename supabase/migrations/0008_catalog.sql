-- ============================================================================
-- Sale catalog module: boats marked for sale get a photo gallery + asking
-- price. Adds a `boat_type` classification to `boats` (commercial/private/
-- for sale) so the app can show the Catalog tab only where it's relevant.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'boat_type') then
    create type public.boat_type as enum ('commercial', 'private', 'for_sale');
  end if;
end $$;

alter table public.boats
  add column if not exists boat_type public.boat_type not null default 'private',
  add column if not exists sale_price numeric;

create table if not exists public.catalog_photos (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  photo_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists catalog_photos_boat_id_idx on public.catalog_photos (boat_id);

alter table public.catalog_photos enable row level security;

-- No approval concept here (matches the source app) - visible to everyone
-- on the boat, editable by management + captain.
drop policy if exists catalog_photos_select on public.catalog_photos;
create policy catalog_photos_select on public.catalog_photos for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists catalog_photos_write on public.catalog_photos;
create policy catalog_photos_write on public.catalog_photos for all
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()))
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

-- ----------------------------------------------------------------------------
-- Storage: private bucket for catalog photos.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', false)
on conflict (id) do nothing;

drop policy if exists catalog_storage_select on storage.objects;
create policy catalog_storage_select on storage.objects for select
  using (
    bucket_id = 'catalog'
    and (public.is_management() or (storage.foldername(name))[1] = public.current_boat_id()::text)
  );

drop policy if exists catalog_storage_insert on storage.objects;
create policy catalog_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'catalog'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists catalog_storage_delete on storage.objects;
create policy catalog_storage_delete on storage.objects for delete
  using (
    bucket_id = 'catalog'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
