-- ============================================================================
-- Extended boat specs (beam/draft/flag/berth/MMSI) + a logo/hero-image
-- storage bucket, matching the demo's boat spec sheet and boat cards.
-- ============================================================================

alter table public.boats
  add column if not exists beam_meters numeric,
  add column if not exists draft_meters numeric,
  add column if not exists flag text,
  add column if not exists berth text,
  add column if not exists mmsi text,
  add column if not exists logo_path text,
  add column if not exists image_path text;

-- ----------------------------------------------------------------------------
-- Storage: private bucket for boat logos + hero images, folder-scoped by
-- boat_id (same pattern as the catalog bucket in 0008).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('boat-photos', 'boat-photos', false)
on conflict (id) do nothing;

drop policy if exists boat_photos_storage_select on storage.objects;
create policy boat_photos_storage_select on storage.objects for select
  using (
    bucket_id = 'boat-photos'
    and (public.is_management() or (storage.foldername(name))[1] = public.current_boat_id()::text)
  );

drop policy if exists boat_photos_storage_insert on storage.objects;
create policy boat_photos_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'boat-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists boat_photos_storage_update on storage.objects;
create policy boat_photos_storage_update on storage.objects for update
  using (
    bucket_id = 'boat-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  )
  with check (
    bucket_id = 'boat-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists boat_photos_storage_delete on storage.objects;
create policy boat_photos_storage_delete on storage.objects for delete
  using (
    bucket_id = 'boat-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
