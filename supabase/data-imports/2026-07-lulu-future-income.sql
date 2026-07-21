-- ============================================================================
-- Imports Lulu's 12 booked charters for the 2026 season as structured
-- future-income rows (from Lulu_2026_1.xlsx: the "Charter 2026" master
-- list plus each charter's own per-code "CHARTER ANALYSIS" sheet).
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact charter codes)
-- before re-inserting.
--
-- IMPORTANT - amount is NOT recomputed from the app's standard 15%/5% VAT
-- formula here. Checking all 12 sheets found the underlying deal terms
-- aren't uniform: 4 of them (2600365, 26001361, 26001385, 2600548) deduct
-- an extra "VAT on agent commission" the standard formula doesn't account
-- for, and 2 of them (26001046, 26001467) use a discounted/non-standard
-- commission split entirely. Recomputing via the fixed formula would have
-- silently produced a wrong net-to-owner figure for 6 of the 12 rows - so
-- every amount below is copied directly from that charter's own already-
-- computed "Total" cell in its sheet (verified against the "Charter 2026"
-- master list, which matches exactly), not re-derived.
--
-- gross_price/apa are each charter's own real entered values (a couple of
-- charters used a discounted gross, e.g. 26001467's 28350 = 31500*0.9 -
-- that's the actual figure that sheet's own analysis used, not the list
-- price). delivery_fee/redelivery_fee are 0 on every sheet (never used).
-- APA is stored for display but - matching every one of these 12 sheets,
-- which all place APA in a side column the Total formula never reaches -
-- is correctly excluded from amount, per the app's computeCharterBreakdown
-- fix landed alongside this file.
--
-- No PDF contracts attached (none were provided with this import) -
-- contract_document_id stays null; she can attach one later via the
-- future-income page if she has the signed contracts on hand.
--
-- Imported as already-approved (status = 'approved'), matching every
-- other bulk import this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'lulu';
  if v_boat_id is null then
    raise exception 'Boat "Lulu" not found (matched on lower(trim(name)) = ''lulu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes
    where boat_id = v_boat_id
    and type = 'future'
    and charter_code in (
      '2600614', '2600365', '2600854', '2600738', '26001361', '26001046',
      '2600552', '26001467', '26001537', '2600352', '26001385', '2600548'
    );

  insert into public.incomes
    (boat_id, source, amount, income_date, type, charter_code, embarkation_port, disembarkation_port,
     charter_end_date, gross_price, delivery_fee, redelivery_fee, apa, status, approved_at)
  values
    (v_boat_id, '2600614',   28537.37, '2026-05-12', 'future', '2600614',   'Athens',    'Athens',    '2026-05-22', 31428,    0, 0, 7857,    'approved', now()),
    (v_boat_id, '2600365',   19323.53, '2026-05-31', 'future', '2600365',   'Kefalonia', 'Corfu',     '2026-06-06', 22160,    0, 0, 5330,    'approved', now()),
    (v_boat_id, '2600854',   24062.00, '2026-06-15', 'future', '2600854',   'Corfu',     'Lefkas',    '2026-06-22', 26500,    0, 0, 6625,    'approved', now()),
    (v_boat_id, '2600738',   21273.32, '2026-06-26', 'future', '2600738',   'Lefkas',    'Lefkas',    '2026-07-02', 23428.57, 0, 0, 5857.14, 'approved', now()),
    (v_boat_id, '26001361',  27468.00, '2026-07-08', 'future', '26001361',  'Lefkas',    'Kefalonia', '2026-07-15', 31500,    0, 0, 7875,    'approved', now()),
    (v_boat_id, '26001046',  28413.00, '2026-07-16', 'future', '26001046',  'Kefalonia', 'Kefalonia', '2026-07-23', 29925,    0, 0, 8375,    'approved', now()),
    (v_boat_id, '2600552',   28602.00, '2026-07-25', 'future', '2600552',   'Lefkas',    'Lefkas',    '2026-08-01', 31500,    0, 0, 7875,    'approved', now()),
    (v_boat_id, '26001467',  26982.90, '2026-08-02', 'future', '26001467',  'Lefkas',    'Lefkas',    '2026-08-09', 28350,    0, 0, 7000,    'approved', now()),
    (v_boat_id, '26001537',  28602.00, '2026-08-10', 'future', '26001537',  'Lefkas',    'Lefkas',    '2026-08-17', 31500,    0, 0, 7875,    'approved', now()),
    (v_boat_id, '2600352',   21921.34, '2026-08-30', 'future', '2600352',   'Lefkas',    'Lefkas',    '2026-09-06', 24142,    0, 0, 6035,    'approved', now()),
    (v_boat_id, '26001385',  23108.00, '2026-09-11', 'future', '26001385',  'Kefalonia', 'Lefkas',    '2026-09-18', 26500,    0, 0, 6625,    'approved', now()),
    (v_boat_id, '2600548',   25016.00, '2026-09-19', 'future', '2600548',   'Lefkas',    'Lefkas',    '2026-09-26', 26500,    0, 0, 6700,    'approved', now());
end $$;
