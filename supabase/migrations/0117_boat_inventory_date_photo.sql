-- ============================================================================
-- Adds a date (defaults to today on entry, editable) and an optional photo
-- to each boat_inventory_items row (0116_boat_inventory.sql) - same single-
-- photo-per-item shape as technical_specs.photo_path
-- (0044_technical_spec_photo.sql), not expenses' multi-attachment one, since
-- an inventory item only ever needs the one reference photo.
-- ============================================================================

alter table public.boat_inventory_items
  add column if not exists entry_date date not null default current_date,
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public)
values ('boat-inventory-photos', 'boat-inventory-photos', false)
on conflict (id) do nothing;

-- No approval workflow on this table (unlike technical_specs) - any
-- boat-scoped role (management, captain, or the owner reading their own
-- boat) can read a photo under their own boat's folder; only management or
-- the boat's own captain can write one, same as the table's own RLS.
drop policy if exists boat_inventory_photos_storage_select on storage.objects;
create policy boat_inventory_photos_storage_select on storage.objects for select
  using (
    bucket_id = 'boat-inventory-photos'
    and (public.is_management() or (storage.foldername(name))[1] = public.current_boat_id()::text)
  );

drop policy if exists boat_inventory_photos_storage_insert on storage.objects;
create policy boat_inventory_photos_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'boat-inventory-photos'
    and (
      public.is_management()
      or (public.current_role() = 'captain' and (storage.foldername(name))[1] = public.current_boat_id()::text)
    )
  );

drop policy if exists boat_inventory_photos_storage_delete on storage.objects;
create policy boat_inventory_photos_storage_delete on storage.objects for delete
  using (
    bucket_id = 'boat-inventory-photos'
    and (
      public.is_management()
      or (public.current_role() = 'captain' and (storage.foldername(name))[1] = public.current_boat_id()::text)
    )
  );
