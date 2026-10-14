-- ============================================================================
-- Adds a "water_toys" value to the boat_inventory_category enum (0116_boat_
-- inventory.sql), so the equipment inventory can tag items like jet skis,
-- paddleboards, and towables separately from "deck". Purely additive -
-- existing rows and values are untouched.
-- ============================================================================

alter type public.boat_inventory_category add value if not exists 'water_toys';
