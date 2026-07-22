-- ============================================================================
-- Imports Samara's 4 booked charters for the 2026 season as structured
-- future-income rows (from Samara_2026.xlsx: the "Charter 2026" master list
-- plus each charter's own per-code "CHARTER ANALYSIS" sheet).
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact charter codes)
-- before re-inserting.
--
-- IMPORTANT - amount is NOT recomputed from the app's standard formula
-- here, same reasoning as the Lulu/Stephanie imports: 2600846's sheet adds
-- an extra "VAT of delivery fees 6.5%" line (on top of its 10,000 delivery
-- fee) that computeCharterBreakdown() doesn't model, so recomputing would
-- have silently dropped 650 from its net-to-owner; the app's breakdown
-- view for that one row will show a slightly lower "agent commission" than
-- the sheet's own figure as a result - the stored net-to-owner total is
-- exact either way. Every amount below is copied directly from each
-- charter's own already-computed "Total" cell, verified against the
-- "Charter 2026" master list (matches exactly).
--
-- 26001338 explicitly separates a "VAT of agent commission" line (24% of
-- its 9,000 agent commission) - this is exactly the case the app's
-- agent-commission VAT split (added earlier this session) is designed to
-- reconstruct from the residual, so no special handling needed there.
--
-- gross_price/delivery_fee/redelivery_fee/apa are each charter's own real
-- entered values.
--
-- No PDF contracts attached (none were provided with this import) -
-- contract_document_id stays null; she can attach one later via the
-- future-income page if she has the signed contracts on hand.
--
-- Imported as already-approved (status = 'approved'), matching the Lulu
-- and Stephanie imports earlier this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'samara';
  if v_boat_id is null then
    raise exception 'Boat "Samara" not found (matched on lower(trim(name)) = ''samara'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes
    where boat_id = v_boat_id
    and type = 'future'
    and charter_code in ('2600170', '26001338', '2600704', '2600846');

  insert into public.incomes
    (boat_id, source, amount, income_date, type, charter_code, embarkation_port, disembarkation_port,
     charter_end_date, gross_price, delivery_fee, redelivery_fee, apa, status, approved_at)
  values
    (v_boat_id, '2600170',  79207.52, '2026-06-04', 'future', '2600170',  'Athens', 'Athens',     '2026-06-14', 92857, 0,     0, 27859.31, 'approved', now()),
    (v_boat_id, '26001338', 49020.00, '2026-06-16', 'future', '26001338', 'Athens', 'Mykonos',    '2026-06-22', 60000, 0,     0, 20460.00, 'approved', now()),
    (v_boat_id, '2600704',  59710.00, '2026-07-06', 'future', '2600704',  'Athens', 'Athens',     '2026-07-13', 70000, 0,     0, 17500.00, 'approved', now()),
    (v_boat_id, '2600846',  70360.00, '2026-07-16', 'future', '2600846',  'Athens', 'Santorini',  '2026-07-23', 70000, 10000, 0, 21000.00, 'approved', now());
end $$;
