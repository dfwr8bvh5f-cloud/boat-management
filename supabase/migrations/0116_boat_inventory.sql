-- ============================================================================
-- Per-boat equipment inventory, shown as a new tab under each boat's own
-- Maintenance section (between Specs and Reports - see maintenance/layout.tsx).
-- A simple count of what's aboard, grouped by a fixed set of onboard areas -
-- unlike technical_specs (0019_technical_specs.sql), this has no approval
-- workflow and no photo: just description/category/quantity, so management
-- or the boat's own captain can add/edit it directly. The owner can view it
-- (read-only), same as every other maintenance sub-tab.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'boat_inventory_category') then
    create type public.boat_inventory_category as enum ('storage', 'galley', 'deck', 'interior', 'engine_room', 'other');
  end if;
end $$;

create table if not exists public.boat_inventory_items (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  description text not null,
  category public.boat_inventory_category not null default 'other',
  quantity integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boat_inventory_items_boat_id_idx on public.boat_inventory_items (boat_id);

drop trigger if exists set_updated_at on public.boat_inventory_items;
create trigger set_updated_at before update on public.boat_inventory_items
  for each row execute function public.set_updated_at();

-- Row Level Security: management full access; captain full access on their
-- own boat; owner read-only on their own boat - same shape as technical_specs
-- minus the approval gating (there's no status column here to gate on).
alter table public.boat_inventory_items enable row level security;

drop policy if exists boat_inventory_items_select on public.boat_inventory_items;
create policy boat_inventory_items_select on public.boat_inventory_items for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists boat_inventory_items_insert on public.boat_inventory_items;
create policy boat_inventory_items_insert on public.boat_inventory_items for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists boat_inventory_items_update on public.boat_inventory_items;
create policy boat_inventory_items_update on public.boat_inventory_items for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists boat_inventory_items_delete on public.boat_inventory_items;
create policy boat_inventory_items_delete on public.boat_inventory_items for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );
