-- ============================================================================
-- Imports Stephanie's 10 booked charters for the 2026 season as structured
-- future-income rows (from Stephanie_2026_1.xlsx: the "Charter 2026" master
-- list plus each charter's own per-code "CHARTER ANALYSIS" sheet).
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact charter codes)
-- before re-inserting.
--
-- IMPORTANT - amount is NOT recomputed from the app's standard 15%/5%/VAT
-- formula here, same reasoning as the Lulu import: one sheet (2600570) adds
-- an extra "VAT of delivery fees" line (6.5% of delivery+redelivery, added
-- to the total) that the app's computeCharterBreakdown() doesn't model, so
-- recomputing would have silently dropped ~478 from its net-to-owner. Every
-- amount below is copied directly from that charter's own already-computed
-- "Total" cell, verified against the "Charter 2026" master list (matches
-- exactly, and matches the "SEASON 2026" summary tab's monthly totals too).
-- Note: for 2600570 specifically, the app's expanded breakdown view will
-- show an "agent commission" ~478 lower than the sheet's actual 7,028.55,
-- since that residual absorbs the untracked VAT-of-delivery-fees amount -
-- the stored net-to-owner total itself is exact either way.
--
-- gross_price/delivery_fee/redelivery_fee/apa are each charter's own real
-- entered values. 2600889's sheet uses an odd non-standard commission
-- calc (referencing a different charter's gross by mistake) but its own
-- Total is still used as-is, since that's the real ground truth figure.
--
-- No PDF contracts attached (none were provided with this import) -
-- contract_document_id stays null; she can attach one later via the
-- future-income page if she has the signed contracts on hand.
--
-- Imported as already-approved (status = 'approved'), matching the Lulu
-- import earlier this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes
    where boat_id = v_boat_id
    and type = 'future'
    and charter_code in (
      '2600281', '2600570', '2600909', '2600275', '2600423',
      '2600257', '26001466', '2600889', '2600753', '2600997'
    );

  insert into public.incomes
    (boat_id, source, amount, income_date, type, charter_code, embarkation_port, disembarkation_port,
     charter_end_date, gross_price, delivery_fee, redelivery_fee, apa, status, approved_at)
  values
    (v_boat_id, '2600281',  24611.50, '2026-05-17', 'future', '2600281',  'Athens',       'Kea',          '2026-05-22', 27915, 0,    800, 5583.73, 'approved', now()),
    (v_boat_id, '2600570',  47797.27, '2026-06-17', 'future', '2600570',  'Mykonos',      'Santorini',    '2026-06-25', 46857, 1500, 5850, 9371.40, 'approved', now()),
    (v_boat_id, '2600909',  37105.50, '2026-07-04', 'future', '2600909',  'Nea Peramos',  'Nea Peramos',  '2026-07-11', 43500, 0,    0,   8700.00, 'approved', now()),
    (v_boat_id, '2600275',  37105.50, '2026-07-12', 'future', '2600275',  'Nea Peramos',  'Nea Peramos',  '2026-07-19', 43500, 0,    0,   8700.00, 'approved', now()),
    (v_boat_id, '2600423',  21205.58, '2026-07-20', 'future', '2600423',  'Nea Peramos',  'Nea Peramos',  '2026-07-24', 24860, 0,    0,   4972.00, 'approved', now()),
    (v_boat_id, '2600257',  37105.50, '2026-07-25', 'future', '2600257',  'Nea Peramos',  'Nea Peramos',  '2026-08-01', 43500, 0,    0,   8700.00, 'approved', now()),
    (v_boat_id, '26001466', 31804.11, '2026-08-10', 'future', '26001466', 'Nea Peramos',  'Nea Peramos',  '2026-08-16', 37285, 0,    0,   7457.00, 'approved', now()),
    (v_boat_id, '2600889',  37024.25, '2026-08-17', 'future', '2600889',  'Athens',       'Athens',       '2026-08-24', 42250, 0,    0,   8450.00, 'approved', now()),
    (v_boat_id, '2600753',  34973.00, '2026-09-05', 'future', '2600753',  'Athens',       'Athens',       '2026-09-12', 41000, 0,    0,   8200.00, 'approved', now()),
    (v_boat_id, '2600997',  34973.00, '2026-09-13', 'future', '2600997',  'Athens',       'Athens',       '2026-09-20', 41000, 0,    0,   8200.00, 'approved', now());
end $$;
