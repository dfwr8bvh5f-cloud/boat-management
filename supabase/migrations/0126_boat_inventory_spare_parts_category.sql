-- ============================================================================
-- Adds a "spare_parts" value to the boat_inventory_category enum (0116_boat_
-- inventory.sql, extended once already by 0119's "water_toys"), so the
-- equipment inventory can tag spare parts separately from "other". Purely
-- additive - existing rows and values are untouched.
-- ============================================================================

alter type public.boat_inventory_category add value if not exists 'spare_parts';
