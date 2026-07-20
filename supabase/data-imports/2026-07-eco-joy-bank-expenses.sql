-- ============================================================================
-- One-time data import: ECO JOY's bank deposit and expenses, from
-- ILIAD_53_ODED__Bank_Account.pdf and ILIAD_53_ODED__Expenses.pdf (source
-- files are named after the boat's hull/technical model "ILIAD_53_ODED",
-- not its fleet nickname - boat lookup below matches on "eco joy").
--
-- Single file, no run-order dependency (unlike some other boats' imports):
-- no catch-all/opening-balance row is needed here. The Bank_Account.pdf
-- states "Bank balance at hand: -EUR81.24" and that reconciles exactly to
-- the itemized rows below with zero gap (deposit EUR3,986.91 minus the two
-- bank-transfer expenses EUR836.71 + EUR3,231.44 = -EUR81.24) - consistent
-- with this being a brand-new boat with no prior undocumented history.
--
-- Expenses.pdf's "PAID WITH" column maps to payment_method as:
--   BANK TRANSFER PIRAEUS -> bank_transfer
--   OTHER                 -> other
-- (verified against the sheet's own stated "Total bank expenses" figure,
-- which matches exactly with only the two BANK TRANSFER PIRAEUS rows).
-- One row in the source ("CAPITAL EXPENSES" on its own with no other
-- fields) is a blank section-header divider, not a real expense - skipped.
--
-- One row ("management fees July") has neither a date nor a payment method
-- in the source sheet - entered with both left NULL rather than guessed, so
-- it surfaces in the app's "Pending expenses (incomplete)" section for the
-- user to fill in manually.
--
-- No cash_transactions rows - no cash data given for this boat.
--
-- Safe to re-run: deletes this script's own rows (matched by boat_id + a
-- marker in notes) before re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_marker text := 'eco-joy-bank-expenses-2026-import';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'eco joy';
  if v_boat_id is null then
    raise exception 'Boat "eco joy" not found (matched on lower(trim(name)) = ''eco joy'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and source = v_marker;
  delete from public.expenses where boat_id = v_boat_id and notes = v_marker;

  -- Itemized bank deposit, from Bank_Account.pdf.
  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, v_marker, 3986.91, '2026-06-12', 'actual', 'approved');

  -- Itemized expenses, from Expenses.pdf.
  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status, notes) values
    (v_boat_id, null, 'management fees July', 'management', null, 650.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-12', 'traveling expensess tsafrir', 'underway_expenses', 'bank_transfer', 836.71, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-12', 'decorative pillows', 'capital_expenses', 'bank_transfer', 3231.44, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-18', 'Highfield CL 400 HYP', 'capital_expenses', 'other', 25824.88, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-17', 'PERGOLA DESIGN - lounge chair, aluminum director''s chair', 'capital_expenses', 'other', 10568.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-17', 'INTERNI- coffe table, indoor lounge table', 'capital_expenses', 'other', 4050.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-14', 'managemenr fees- January- 3/4 June (50% discount from 1300 per month)', 'management', 'other', 3375.00, 'crew', 'approved', v_marker);
end $$;
