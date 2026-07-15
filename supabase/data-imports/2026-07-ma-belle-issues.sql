-- ============================================================================
-- Imports the technical/maintenance issues list for MA BELLE, from
-- Technical_Project_Manager_Project_Manager_6.pdf (10 rows).
--
-- Column mapping: Description -> title, Classification -> classification
-- directly ("Repair"/"Service" both match existing enum values), Area/
-- Category -> area ("Technical"/"Equipment" both match existing enum
-- values), Location/Type -> location, Supplier -> supplier_labour (same
-- mapping used for the LULU import), Status -> op_status ("In progress"/
-- "Pending" both match existing enum values), Date assigned -> the new
-- issue_date field (added this same session - a real date, not a
-- placeholder here, unlike prior imports where it had to go into notes).
--
-- Not entered (left null): estimated cost (every row is the "€ xx.xx"
-- placeholder, not a real figure), due date (every row is the "dd/mm/yyyy"
-- placeholder), assigned_to and notes (both blank for every row in the
-- source).
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect/spec imports this boat and others have had.
--
-- Idempotent: deletes any prior run of this exact script (same title match)
-- before re-inserting, so it's safe to run more than once.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'ma belle';
  if v_boat_id is null then
    raise exception 'Boat "Ma Belle" not found (matched on lower(trim(name)) = ''ma belle'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'New Boiler', 'fire extinguishers- liferafts- flares service', 'Carbon monoxide sensors 7 units',
      'Inspect exhaust hoses and risers for corrosion or cracks', 'generators service',
      'generator sea water pump service', 'Seakeeper service', 'Tender jet service', 'A/C service',
      'Health test for batteries'
    );

  insert into public.issues
    (boat_id, title, classification, area, location, supplier_labour, estimated_cost, due_date, issue_date, notes, op_status, status, approved_at)
  values
    (v_boat_id, 'New Boiler', 'repair', 'technical', 'MACHINERY', 'MARINAKIS MARINE SERVICES', null, null, '2026-01-20', null, 'in_progress', 'approved', now()),
    (v_boat_id, 'fire extinguishers- liferafts- flares service', 'service', 'equipment', 'SAFETY', 'PYRSOS', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'Carbon monoxide sensors 7 units', 'service', 'equipment', 'SAFETY', 'PYRSOS', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'Inspect exhaust hoses and risers for corrosion or cracks', 'service', 'technical', 'MACHINERY', 'ACTIVE MARINE', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'generators service', 'service', 'technical', 'MACHINERY', 'ACTIVE MARINE', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'generator sea water pump service', 'service', 'technical', 'WATER SYSTEM', 'ACTIVE MARINE', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'Seakeeper service', 'service', 'technical', 'MACHINERY', 'Motocraft', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'Tender jet service', 'service', 'technical', 'DINGHY', 'JET ENGINES', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'A/C service', 'service', 'technical', 'MACHINERY', 'ARIA SOLUTIONS', null, null, '2026-03-16', null, 'pending', 'approved', now()),
    (v_boat_id, 'Health test for batteries', 'service', 'technical', 'ELECTRIC', 'TASOS ELECTR.', null, null, '2026-03-16', null, 'pending', 'approved', now());
end $$;
