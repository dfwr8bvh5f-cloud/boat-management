-- ============================================================================
-- Boat photo gallery: multiple photos per boat, one of which is chosen as
-- the "primary" photo (still stored on boats.image_path, shown on the
-- fleet list). Management and captains can add/remove/pick primary; owners
-- can add photos too (by request), but not remove or set the primary one.
-- ============================================================================

create table if not exists public.boat_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  photo_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists boat_gallery_photos_boat_id_idx on public.boat_gallery_photos (boat_id);

alter table public.boat_gallery_photos enable row level security;

drop policy if exists boat_gallery_photos_select on public.boat_gallery_photos;
create policy boat_gallery_photos_select on public.boat_gallery_photos for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists boat_gallery_photos_insert on public.boat_gallery_photos;
create policy boat_gallery_photos_insert on public.boat_gallery_photos for insert
  with check (
    public.is_management()
    or (public.current_role() in ('captain', 'owner') and boat_id = public.current_boat_id())
  );

drop policy if exists boat_gallery_photos_delete on public.boat_gallery_photos;
create policy boat_gallery_photos_delete on public.boat_gallery_photos for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- Storage: owners could already read from their boat's folder; now they can
-- upload into it too (previously captain + management only).
drop policy if exists boat_photos_storage_insert on storage.objects;
create policy boat_photos_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'boat-photos'
    and (
      public.is_management()
      or (
        public.current_role() in ('captain', 'owner')
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
