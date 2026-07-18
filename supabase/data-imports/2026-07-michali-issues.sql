-- ============================================================================
-- One-time data import: MICHALI's open defects, from SUNREEF_70.pdf (the
-- boat's hull model - MICHALI is a Sunreef 70, same nickname/model
-- relationship as the other boats' import files use the fleet nickname).
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Column mapping: Description -> title, Classification -> is_warranty flag
-- (see below), Area/Category -> area, Location/Type -> location,
-- Supplier -> supplier_labour, Status -> op_status, Date assigned -> issue_date.
--
-- Classification: 19 of the 21 rows say "Waranty" in the source, which is
-- no longer a selectable `classification` value in this app (migration
-- 0061 replaced it with the standalone is_warranty boolean - the shield
-- icon comes from that flag, not from classification text). Those 19 rows
-- are entered as classification = 'repair' (the schema's own default,
-- and the closest fit - these are supplier-covered defects to be fixed)
-- with is_warranty = true. The remaining 2 rows (both "Chase boat" items)
-- give a real classification in the source ("Repair"/"Capital") and are
-- entered as classification = 'repair' / 'capital' with is_warranty = false.
--
-- Not entered (left null, per "estimated cost/due date were template
-- placeholders" rule used in every other issues import this session):
--   - Estimated cost: every row is the "€ xx.xx" placeholder.
--   - Due date: every row is the "dd/mm/yyyy" placeholder.
--   - Payment method / Assigned to / Notes: blank for every row in the source.
--   - "Days remaining" is a derived display value, not stored anywhere.
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect imports this session (Haven, Lulu, Mintu, Roga Li, Ma Belle).
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'michali';
  if v_boat_id is null then
    raise exception 'Boat "Michali" not found (matched on lower(trim(name)) = ''michali'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'Worng postion of jet ski bases', 'Grey Silikon colour in port aft cabin', 'Barometer/chronograph missing',
      'D-shackle/fixing points platform missing', 'Floor hatch Stbd in front of wine fridge/cockpit door-bend',
      'Battery bank is overheating', 'Pantograph door is not working-not lock', 'Drain plug from jetski is missing',
      'Left drawer broken locker', 'Blinds falling apart - several cabins',
      'Insulation of water boiler is coming off Stbd engine room',
      'AC turns itself into heating mode - even after putting back in mode of choice',
      'Escape hatch leaking on Port hull', 'Tile cracked in bathroom', 'AC control not working in all cabin',
      'Tile cracked', 'Rust on tender lift mechanism', 'Forepeak sofa lounge table 3 teak planks broken',
      'Port mid cabin bathroom tile broken', 'Chase boat - 1 cushion needs repair',
      'Chase boat install a terminal cover'
    );

  insert into public.issues
    (boat_id, title, classification, is_warranty, area, location, supplier_labour, issue_date, op_status, status, approved_at)
  values
    (v_boat_id, 'Worng postion of jet ski bases', 'repair', true, 'exterior', 'WATERSPORTS', 'SUNREEF', '2026-03-20', 'pending', 'approved', now()),
    (v_boat_id, 'Grey Silikon colour in port aft cabin', 'repair', true, 'interior', 'PORT AFT', 'SUNREEF', '2026-03-19', 'pending', 'approved', now()),
    (v_boat_id, 'Barometer/chronograph missing', 'repair', true, 'technical', 'GENERAL', 'SUNREEF', '2026-03-23', 'pending', 'approved', now()),
    (v_boat_id, 'D-shackle/fixing points platform missing', 'repair', true, 'exterior', 'DECK', 'SUNREEF', '2026-03-23', 'pending', 'approved', now()),
    (v_boat_id, 'Floor hatch Stbd in front of wine fridge/cockpit door-bend', 'repair', true, 'interior', 'SALOON', 'SUNREEF', '2026-04-08', 'pending', 'approved', now()),
    (v_boat_id, 'Battery bank is overheating', 'repair', true, 'technical', 'GENERAL', 'SUNREEF', '2026-04-08', 'pending', 'approved', now()),
    (v_boat_id, 'Pantograph door is not working-not lock', 'repair', true, 'interior', 'EQUIPMENT', 'SUNREEF', '2026-04-07', 'pending', 'approved', now()),
    (v_boat_id, 'Drain plug from jetski is missing', 'repair', true, 'equipment', 'WATERSPORTS', 'SUNREEF', '2026-04-16', 'pending', 'approved', now()),
    (v_boat_id, 'Left drawer broken locker', 'repair', true, 'interior', 'MASTER CABIN', 'SUNREEF', '2026-04-23', 'pending', 'approved', now()),
    (v_boat_id, 'Blinds falling apart - several cabins', 'repair', true, 'interior', 'ALL CABINS', 'SUNREEF', '2026-04-23', 'pending', 'approved', now()),
    (v_boat_id, 'Insulation of water boiler is coming off Stbd engine room', 'repair', true, 'technical', 'MACHINERY', 'SUNREEF', '2026-04-23', 'pending', 'approved', now()),
    (v_boat_id, 'AC turns itself into heating mode - even after putting back in mode of choice', 'repair', true, 'technical', 'MACHINERY', 'SUNREEF', '2026-04-24', 'pending', 'approved', now()),
    (v_boat_id, 'Escape hatch leaking on Port hull', 'repair', true, 'interior', 'hull port', 'SUNREEF', '2026-04-24', 'pending', 'approved', now()),
    (v_boat_id, 'Tile cracked in bathroom', 'repair', true, 'interior', 'port aft', 'SUNREEF', '2026-05-20', 'pending', 'approved', now()),
    (v_boat_id, 'AC control not working in all cabin', 'repair', true, 'interior', 'ALL CABINS', 'SUNREEF', '2026-05-20', 'pending', 'approved', now()),
    (v_boat_id, 'Tile cracked', 'repair', true, 'interior', 'MASTER CABIN', 'SUNREEF', '2026-05-20', 'pending', 'approved', now()),
    (v_boat_id, 'Rust on tender lift mechanism', 'repair', true, 'exterior', 'EQUIPMENT', 'SUNREEF', '2026-05-20', 'pending', 'approved', now()),
    (v_boat_id, 'Forepeak sofa lounge table 3 teak planks broken', 'repair', true, 'exterior', 'DECK', 'SUNREEF', '2026-06-08', 'pending', 'approved', now()),
    (v_boat_id, 'Port mid cabin bathroom tile broken', 'repair', true, 'interior', 'hull port', 'SUNREEF', '2026-06-08', 'pending', 'approved', now()),
    (v_boat_id, 'Chase boat - 1 cushion needs repair', 'repair', false, 'technical', 'DINGHY', null, '2026-07-08', 'pending', 'approved', now()),
    (v_boat_id, 'Chase boat install a terminal cover', 'capital', false, 'technical', 'DINGHY', null, '2026-07-08', 'pending', 'approved', now());
end $$;
