-- ============================================================================
-- One-time data import: LULU's project/defect list, from LULU_Project_Table.xlsx.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Column mapping:
--   Description -> title
--   Classification (Capital/Warranty/Service) -> classification directly -
--     the "Warranty" rows get classification = 'warranty', which is what
--     shows the warranty icon in the app.
--   Area/Category -> area
--   Location/Type -> location
--   Supplier -> supplier_labour (the contractor doing the work, same field
--     roga-li's import used for "Lagoon"/"Active Marine" etc.) - the plain
--     `supplier` field is left null, since the sheet doesn't distinguish a
--     separate parts supplier from the labour contractor.
--   "Assigned to" (values like "MYS", "winterize 26-27") is NOT mapped to
--     the app's `assigned_to` field - that field is a fixed captain/
--     management picker, not free text, so a contractor/company name or a
--     season note doesn't fit it. Kept in `notes` instead, so nothing is
--     silently dropped.
--   "Date assigned" has no matching column on public.issues, so it's also
--     kept in `notes` (matching how roga-li's import kept its own non-
--     matching sheet columns in notes rather than forcing them elsewhere).
--   "Days remaining" is derived from due_date in the source sheet, not its
--     own data - not imported.
--
-- Not entered (left null - per "leave blank, I'll fill it"):
--   - Estimated cost wherever the source showed the placeholder "€ xx.xx"
--     (only 5 rows had a real figure: stairs, extra wood works, water
--     purifier, camera reverse and mast, radar).
--   - Due date wherever the source showed the placeholder "dd/mm/yyyy".
--   - Location/supplier wherever the source cell was empty.
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

  insert into public.issues (boat_id, title, classification, area, location, supplier_labour, estimated_cost, due_date, notes, op_status, status, approved_at) values
    (v_boat_id, 'water toys- mount', 'capital', 'equipment', 'WATERSPORTS', 'DEMOS INOX', null, '2026-03-16', 'Date assigned: 15 Jan 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'stairs', 'capital', 'interior', 'ALL INTERIOR', 'GEORGE CARPENTER', 190.00, '2026-02-20', 'Date assigned: 13 Jan 2026 · SHIPYARD · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'extra wood works', 'capital', 'interior', 'ALL INTERIOR', 'GEORGE CARPENTER', 2100.00, '2026-02-20', 'Date assigned: 13 Jan 2026 · SHIPYARD · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'outside shower', 'capital', 'exterior', 'DECK', 'ARIA SOLUTIONS', null, '2026-02-23', 'Date assigned: 13 Jan 2026 · after teak inst. · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'water purifier', 'capital', 'technical', 'GENERAL', 'ARIA SOLUTIONS', 1950.00, '2026-02-23', 'Date assigned: 13 Jan 2026 · NEA PERAMOS · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'camera reverse and mast', 'capital', 'technical', 'GENERAL', 'TASOS ELECTR.', 1200.00, '2026-02-11', 'Date assigned: 13 Jan 2026 · SHIPYARD · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'bow thrusters', 'capital', 'technical', 'MACHINERY', null, null, null, 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'deep freezer (dryer space)', 'capital', 'interior', 'EQUIPMENT', null, null, '2026-02-25', 'Date assigned: 13 Jan 2026 · NEA PERAMOS · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'radar', 'capital', 'technical', 'ELECTRONIC', 'LAGOON', 4520.00, '2026-03-15', 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'cancelled', 'approved', now()),
    (v_boat_id, 'drain close to saloon - marks', 'warranty', 'exterior', 'DECK', 'LAGOON', null, null, 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'pending', 'approved', now()),
    (v_boat_id, 'repair on locker as you enter the boat', 'warranty', 'exterior', 'DECK', 'LAGOON', null, null, 'Date assigned: 13 Jan 2026 · Assigned: MYS', 'pending', 'approved', now()),
    (v_boat_id, 'small area, under the chain, to be polished', 'warranty', 'exterior', 'BOW', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'scratches aft portside', 'warranty', 'exterior', 'HULL PORT', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'floor join to redo', 'warranty', 'interior', 'SALOON/GALLEY', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'gel coat repair to be finished aft of fb', 'warranty', 'exterior', 'FLYBRIDGE', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'gel coat repair to be finished mid port', 'warranty', 'exterior', 'FLYBRIDGE', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'moving floor are curved', 'warranty', 'interior', 'SALOON', 'LAGOON', null, null, 'Date assigned: 14 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'build fly bridge furniture', 'capital', 'exterior', 'FLYBRIDGE', 'STAMATIS GELCOAT', null, '2026-02-03', 'Date assigned: 15 Jan 2026 · SHIPYARD', 'cancelled', 'approved', now()),
    (v_boat_id, 'replacement of gas strut locker', 'warranty', 'exterior', null, 'LAGOON', null, null, 'Date assigned: 23 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'master cabin stbd damage/ floor', 'warranty', 'interior', null, 'LAGOON', null, null, 'Date assigned: 26 Jan 2026', 'pending', 'approved', now()),
    (v_boat_id, 'installation of an aft spotlight', 'capital', 'exterior', 'DECK', null, null, null, 'Date assigned: 12 Feb 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'removal of a single faucet (gopure system)', 'capital', 'technical', 'WATER SYSTEM', 'STAMATIS GELCOAT', null, null, 'Date assigned: 2 Apr 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'extra fridge', 'capital', 'interior', 'SALOON/GALLEY', null, null, null, 'Date assigned: 2 Apr 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'repairs main sliding door', 'capital', 'technical', 'GENERAL', 'GEORGE GANGWAYS', null, null, 'Date assigned: 2 Apr 2026', 'in_progress', 'approved', now()),
    (v_boat_id, 'ac boxes (x2) skipper cabins', 'capital', 'interior', 'SKIPPER CABINS', 'ENEQ/ONAN', null, null, 'Date assigned: 2 Apr 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'new side hatches for skipper cabins', 'capital', 'interior', 'SKIPPER CABINS', 'STAMATIS GELCOAT', null, null, 'Date assigned: 2 Apr 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'plastic cover for chain locker and life raft locker', 'capital', 'exterior', 'DECK', null, null, null, 'Date assigned: 2 Apr 2026', 'cancelled', 'approved', now()),
    (v_boat_id, 'ac electric pump change 220v to 24v', 'service', 'technical', 'ELECTRIC', null, null, '2027-02-28', 'Date assigned: 15 Jun 2026 · Assigned: winterize 26-27', 'pending', 'approved', now()),
    (v_boat_id, 'fw inlet generator', 'service', 'technical', 'MACHINERY', null, null, null, 'Date assigned: 15 Jun 2026 · Assigned: winterize 26-27', 'pending', 'approved', now());
end $$;
