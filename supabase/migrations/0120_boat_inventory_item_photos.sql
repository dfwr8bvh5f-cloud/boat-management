-- ============================================================================
-- Lets an inventory item (0116_boat_inventory.sql) carry more than one
-- reference photo. The existing single `photo_path` column stays as-is (an
-- item's first photo still gets written there too, for backward
-- compatibility with anything reading that column directly) - any photo
-- beyond the first goes into this table instead, one row per file. Same
-- shape as expense_attachments (0049), minus the receipt/photo `kind` split
-- since an inventory item only ever has photos.
-- ============================================================================

create table if not exists public.boat_inventory_item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.boat_inventory_items (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists boat_inventory_item_photos_item_id_idx on public.boat_inventory_item_photos (item_id);

alter table public.boat_inventory_item_photos enable row level security;

-- Same shape as boat_inventory_items' own policies (0116) - no approval
-- gating on this table either.
drop policy if exists boat_inventory_item_photos_select on public.boat_inventory_item_photos;
create policy boat_inventory_item_photos_select on public.boat_inventory_item_photos for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists boat_inventory_item_photos_insert on public.boat_inventory_item_photos;
create policy boat_inventory_item_photos_insert on public.boat_inventory_item_photos for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists boat_inventory_item_photos_delete on public.boat_inventory_item_photos;
create policy boat_inventory_item_photos_delete on public.boat_inventory_item_photos for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- No change needed to the boat-inventory-photos bucket's own storage
-- policies (0117) - they already grant access by folder prefix
-- ({boat_id}/...), not by matching a specific DB column, so they already
-- cover any additional photo uploaded under the same boat's folder.
