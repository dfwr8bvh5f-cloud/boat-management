-- ============================================================================
-- One-time data import: STEPHANIE's open defects, from STEPHANIE_LIST.pdf.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Column mapping: Description -> title, Area/Category -> area,
-- Location/Type -> location, Supplier -> supplier_labour, Status -> op_status,
-- Date assigned -> issue_date, Notes ("winterize 25-26") -> notes.
--
-- Classification: 7 of the 11 rows say "Waranty" in the source, which isn't
-- a selectable classification in the app's UI anymore (the shield icon comes
-- from the standalone is_warranty boolean) - entered as classification =
-- 'repair' (closest fit - a defect to be fixed) with is_warranty = true,
-- same convention as the MICHALI import. The other 4 rows give a real
-- classification ("Capital"/"Repair") and are entered directly, is_warranty
-- = false.
--
-- Not entered (left null, per "estimated cost/due date were template
-- placeholders" rule used in every other issues import this session):
--   - Estimated cost: every row is the "€ xx.xx" placeholder.
--   - Due date: every row is the "dd/mm/yyyy" placeholder.
--   - Payment method / Assigned to: blank for every row in the source.
--   - "Days remaining" is a derived display value, not stored anywhere.
--   - Row 1's own "Date assigned" is ALSO the "dd/mm/yyyy" placeholder
--     (unlike every other row here, which has a real date) - left null.
--
-- The `area` column is NOT NULL with no default (migration 0065) - the 2
-- "Cracks rudders..." rows have a blank Area/Category cell in the source,
-- so they're entered as 'technical' (a rudder-bearing/hull-trunk crack is
-- technical in nature; not guessed at random, but not from the source
-- either - flagged here for visibility).
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect imports this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'Install new steps-flexi teak', 'Floor protective covers for winter-hull out',
      'Toping lift/boom sheet replace', 'Repaint cross beam', 'Change tender floor to flexiteek',
      'Tender fuel tank overflowing', 'Gangway reinforecment/ stair', 'Stbd side hatch need repair',
      'Change 2 mast lights', 'Cracks rudders bearing housing both sides',
      'Cracks rudder''s trunk hull connection both sides'
    );

  insert into public.issues
    (boat_id, title, classification, is_warranty, area, location, supplier_labour, issue_date, op_status, status, notes, approved_at)
  values
    (v_boat_id, 'Install new steps-flexi teak', 'repair', true, 'exterior', 'cockpit', 'MYS TECH', null, 'pending', 'approved', null, now()),
    (v_boat_id, 'Floor protective covers for winter-hull out', 'capital', false, 'exterior', null, null, '2025-12-01', 'pending', 'approved', 'winterize 25-26', now()),
    (v_boat_id, 'Toping lift/boom sheet replace', 'capital', false, 'exterior', 'deck', 'ROPE ALIGN', '2025-12-01', 'pending', 'approved', 'winterize 25-26', now()),
    (v_boat_id, 'Repaint cross beam', 'repair', true, 'exterior', 'deck', null, '2025-11-01', 'pending', 'approved', 'winterize 25-26', now()),
    (v_boat_id, 'Change tender floor to flexiteek', 'capital', false, 'technical', 'dinghy', null, '2025-11-01', 'pending', 'approved', 'winterize 25-26', now()),
    (v_boat_id, 'Tender fuel tank overflowing', 'repair', false, 'technical', 'dinghy', null, '2025-11-01', 'in_progress', 'approved', 'winterize 25-26', now()),
    (v_boat_id, 'Gangway reinforecment/ stair', 'repair', false, 'exterior', 'deck', 'STAMATIS GELCOAT', '2026-02-18', 'pending', 'approved', null, now()),
    (v_boat_id, 'Stbd side hatch need repair', 'repair', true, 'exterior', 'hull stbd', null, '2026-03-02', 'pending', 'approved', null, now()),
    (v_boat_id, 'Change 2 mast lights', 'repair', true, 'exterior', 'equipment', 'VEGA', '2026-06-26', 'pending', 'approved', null, now()),
    (v_boat_id, 'Cracks rudders bearing housing both sides', 'repair', true, 'technical', null, null, '2026-07-06', 'pending', 'approved', null, now()),
    (v_boat_id, 'Cracks rudder''s trunk hull connection both sides', 'repair', true, 'technical', null, null, '2026-07-06', 'pending', 'approved', null, now());
end $$;
