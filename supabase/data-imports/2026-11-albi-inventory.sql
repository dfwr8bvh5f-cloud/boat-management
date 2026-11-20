-- ============================================================================
-- One-time data import: Albi's equipment inventory (Maintenance > Inventory),
-- from the paper "INVENTORY ALBI" list. DATA only, not a schema change.
--
-- Per request: no categories (every row gets the column's own default,
-- 'other'; section headings on the paper list are not entered) and the
-- entry date is the day of the import (2026-11-20).
-- The check marks next to the first three lines on the paper are not stored
-- (the table has no checked/verified column).
-- Quantities are the leading number on each line; the two lines where the
-- number trails the text (LED headlamps "2", Nilotinib "3") use that number.
--
-- Safe to re-run: deletes any prior run of this exact script (matched by
-- boat_id + entry_date + these exact descriptions) before re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'albi';
  if v_boat_id is null then
    raise exception 'Boat "Albi" not found (matched on lower(trim(name)) = ''albi'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  create temp table _albi_inventory (description text, quantity integer) on commit drop;

  insert into _albi_inventory (description, quantity) values
    ('Bright orange Seabob underwater scooter', 1),
    ('Seabob rack', 1),
    ('Grey and black transport bag with green graphics for an inflatable stand-up paddleboard (Jobe Duna 11.6 Touring Adventure)', 1),
    ('ICOM marine handheld VHF radios (IC-M25 series)', 2),
    ('LED headlamps with adjustable elastic straps', 2),
    ('Dyson hair dryer', 1),
    ('Set of Tech Dumbbells', 1),
    ('Marine dive/safety knife with a black sheath', 1),
    ('Pair of black binoculars', 2),
    ('Patterned Moka stovetop espresso maker (Bialetti x Dolce & Gabbana style)', 1),
    ('Black cast-iron teapot with trivet', 1),
    ('White Smeg 2-slot toaster', 1),
    ('White Smeg electric kettle', 1),
    ('Compact white/black capsule coffee / espresso machine', 1),
    ('White Smeg hand mixer', 1),
    ('Compact mini food processor / chopper with a clear bowl', 1),
    ('Immersion hand blender set (includes whisk attachment and beaker)', 1),
    ('White vegetable mandoline / slicer', 1),
    ('Bottle of Aperol', 1),
    ('Bottle of Captain Morgan Spiced Gold rum', 1),
    ('Additional bottles/glassware protected with mesh sleeves', 1),
    ('Dark grey baseball cap', 1),
    ('Assorted folded clothing items (t-shirts, neck gaiters/scarves)', 1),
    ('Straw / wide-brim hats', 1),
    ('Light-colored visor cap and dark navy cap', 1),
    ('Navy blue technical waterproof jacket (Helly Hansen / HH) on a hanger', 1),
    ('Box of Nilotinib Capsules (200 mg)', 3),
    ('Bottle of Pom Pom eye & face makeup remover / facial cleanser', 1),
    ('Bottle of Dove lotion / body wash', 1),
    ('Pack of Oral-B dental floss / oral care', 1),
    ('Assorted skincare bottles, perfumes (including a Tom Ford bottle), and cosmetics', 1),
    ('Decorative white/yellow flower hair accessory', 1),
    ('Pair of Salomon trail running shoes', 1),
    ('Pair of white Nike sneakers', 1),
    ('Pair of grey/blue athletic shoes with red accents', 1),
    ('Pair of brown leather flip-flops / sandals', 1);

  delete from public.boat_inventory_items
    where boat_id = v_boat_id
    and entry_date = date '2026-11-20'
    and description in (select description from _albi_inventory);

  insert into public.boat_inventory_items (boat_id, description, quantity, entry_date)
    select v_boat_id, description, quantity, date '2026-11-20' from _albi_inventory;
end $$;
