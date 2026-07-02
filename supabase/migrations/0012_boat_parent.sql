-- ============================================================================
-- Sub-boats: a boat can optionally belong "under" another boat in the fleet
-- (e.g. a tender or sister vessel grouped under its main boat), matching the
-- demo's parentBoatId concept.
-- ============================================================================

alter table public.boats
  add column if not exists parent_boat_id uuid references public.boats (id) on delete set null;

create index if not exists boats_parent_boat_id_idx on public.boats (parent_boat_id);
