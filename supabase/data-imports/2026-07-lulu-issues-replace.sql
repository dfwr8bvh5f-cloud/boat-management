-- ============================================================================
-- Replaces 2026-07-lulu-issues.sql: the user asked for ONLY this new,
-- shorter list (from Technical_Project_Manager_Project_Manager_5.pdf) to be
-- entered for LULU, not the earlier 29-row list from LULU_Project_Table.xlsx.
--
-- This script deletes ALL 29 rows from the earlier import (safe to run even
-- if that script was never actually run - the delete is a no-op then) and
-- inserts these 13 rows instead. DATA only, not a schema change. Safe to
-- re-run: also deletes any prior run of this exact script's own rows (same
-- title match) before re-inserting.
--
-- If 2026-07-lulu-issues.sql was already run before this one, running this
-- script cleans it up - no need to manually undo it first.
--
-- Column mapping is the same as the previous LULU import (see that file's
-- header comment for the full rationale): Description -> title,
-- Classification -> classification directly ("Waranty" in the source PDF is
-- a typo for "Warranty" - entered correctly as the real enum value
-- 'warranty', which is what shows the warranty icon in the app), Area ->
-- area, Location -> location, Supplier -> supplier_labour, "Assigned to" and
-- "Date assigned" (no matching columns / not the right kind of field) kept
-- in notes.
--
-- Not entered (left null - per "leave blank, I'll fill it"): estimated cost
-- (every row here is the "€ xx.xx" placeholder) and due date (all "dd/mm/
-- yyyy" placeholder except the AC electric pump row, which has a real date).
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect/spec imports.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'lulu';
  if v_boat_id is null then
    raise exception 'Boat "Lulu" not found (matched on lower(trim(name)) = ''lulu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Remove the previous, superseded 29-row import in full.
  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'water toys- mount', 'stairs', 'extra wood works', 'outside shower', 'water purifier',
      'camera reverse and mast', 'bow thrusters', 'deep freezer (dryer space)', 'radar',
      'drain close to saloon - marks', 'repair on locker as you enter the boat',
      'small area, under the chain, to be polished', 'scratches aft portside', 'floor join to redo',
      'gel coat repair to be finished aft of fb', 'gel coat repair to be finished mid port',
      'moving floor are curved', 'build fly bridge furniture', 'replacement of gas strut locker',
      'master cabin stbd damage/ floor', 'installation of an aft spotlight',
      'removal of a single faucet (gopure system)', 'extra fridge', 'repairs main sliding door',
      'ac boxes (x2) skipper cabins', 'new side hatches for skipper cabins',
      'plastic cover for chain locker and life raft locker', 'ac electric pump change 220v to 24v',
      'fw inlet generator'
    );

  -- Remove any prior run of THIS script's own rows before re-inserting.
  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'Drain close to saloon - marks', 'Repair on locker as you enter the boat',
      'Small area, under the chain, to be polished', 'Scratches aft portside', 'Floor join to redo',
      'Gel coat repair to be finished aft of fb', 'Gel coat repair to be finished mid port',
      'Moving floor are curved', 'Replacement of gas strut locker', 'Master cabin stbd damage/ floor',
      'Repairs main sliding door', 'AC electric pump change 220V to 24V', 'FW inlet generator'
    );

  insert into public.issues (boat_id, title, classification, area, location, supplier_labour, estimated_cost, due_date, notes, op_status, status, approved_at) values
    (v_boat_id, 'Drain close to saloon - marks', 'warranty', 'exterior', 'DECK', 'LAGOON', null, null, 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'pending', 'approved', now()),
    (v_boat_id, 'Repair on locker as you enter the boat', 'warranty', 'exterior', 'DECK', 'LAGOON', null, null, 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'pending', 'approved', now()),
    (v_boat_id, 'Small area, under the chain, to be polished', 'warranty', 'exterior', 'BOW', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Scratches aft portside', 'warranty', 'exterior', 'HULL PORT', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Floor join to redo', 'warranty', 'interior', 'SALOON/GALLEY', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Gel coat repair to be finished aft of fb', 'warranty', 'exterior', 'FLYBRIDGE', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Gel coat repair to be finished mid port', 'warranty', 'exterior', 'FLYBRIDGE', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Moving floor are curved', 'warranty', 'interior', 'SALOON', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Replacement of gas strut locker', 'warranty', 'exterior', null, 'LAGOON', null, null, 'Date assigned: 23 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Master cabin stbd damage/ floor', 'warranty', 'interior', null, 'LAGOON', null, null, 'Date assigned: 26 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Repairs main sliding door', 'repair', 'technical', 'GENERAL', 'GEORGE GANGWAYS', null, null, 'Date assigned: 2 Apr 2026', 'in_progress', 'approved', now()),
    (v_boat_id, 'AC electric pump change 220V to 24V', 'capital', 'technical', 'ELECTRIC', null, null, '2027-02-28', 'Date assigned: 15 Jun 2026 · Assigned: winterize 26-27', 'pending', 'approved', now()),
    (v_boat_id, 'FW inlet generator', 'service', 'technical', 'MACHINERY', null, null, null, 'Date assigned: 15 Jun 2026 · Assigned: winterize 26-27', 'pending', 'approved', now());
end $$;
