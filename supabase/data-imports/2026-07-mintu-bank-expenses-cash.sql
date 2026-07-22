-- ============================================================================
-- One-time data import: MINTU's bank deposits, expenses, and cash flow, from
-- MINTU__Bank_Account.pdf (revised - see below), MINTU__Expenses.pdf and
-- MINTU__Cash_Flow.pdf.
--
-- REVISED after a follow-up review: the user re-checked the bank deposits
-- and confirmed only 7 rows (Mar-Jun 2026, one of which is EUR0.00) are
-- correct - the earlier version of this file also included 14 older "Aya
-- deposit" rows going back to Jan 2025, which the user has now explicitly
-- said to drop. If this file was already run in Supabase with the older
-- deposit list, re-running it will correctly remove those 14 rows (matched
-- by exact date+amount+source) and leave only the confirmed 6 (excluding
-- the EUR0.00 row, which has no financial effect and is not inserted).
--
-- Also per the user's follow-up: the "management fees- August-September"
-- row (30 Jun 2026, MANAGEMENT, CARD - PIRAEUS) had NO amount in the source
-- sheet and was originally skipped entirely - the user has now confirmed
-- the amount directly: EUR2,000.00. Entered as a normal row, flagged in its
-- own description as user-confirmed rather than sourced from the sheet.
--
-- SECOND FOLLOW-UP (cross-check against the actual app data via
-- expenses_8.csv/bank_2.csv/cash_3.csv exports): bank deposits and cash
-- flow matched the app exactly, no changes needed there. Two expense
-- discrepancies were found and corrected:
--   - The source sheet's newest version shows the "management fees-
--     August-September" row WITH an amount now: EUR200.00 (not blank) -
--     this conflicts with the user-confirmed EUR2,000.00 above by 10x, and
--     the sheet's own "Total bank expenses" total also increased by
--     exactly EUR200 (not EUR2,000) between revisions, which mathematically
--     supports EUR200. Flagged and asked directly - the user re-confirmed
--     EUR2,000.00 is correct, so the row is unchanged; the note now
--     documents this known conflict for future reference.
--   - The following row's description changed in the sheet:
--     "management fees- July-August-September" -> "management fees- July"
--     (same date/amount/category) - updated to match.
--   - One row was missing entirely from the original source PDF and has
--     since appeared: 5 Jan 2026, "Gas-tolls", underway_expenses, cash,
--     EUR40.00 - added.
--
-- Payment-method mapping (Expenses.pdf "PAID WITH" column):
--   CASH            -> payment_method 'cash'
--   CARD - PIRAEUS  -> payment_method 'card' (a bank card - counts toward
--                      bank balance the same as bank_transfer)
--   OTHER, or a few rows whose "PAID WITH" cell was blank but the notes say
--   "paid by mys" / "paid by med yacht" / "paid from Eden and Tsafrir
--   private account" -> payment_method 'other' (not paid from MINTU's own
--   bank/cash, so it must not affect either balance)
--
-- Flagged, not guessed:
--   - 6 rows have no date in the source sheet (they sit between two dated
--     rows with a blank DATE cell) - entered with expense_date = NULL rather
--     than assumed to be "same day as the row above", so they surface under
--     the app's "Pending expenses (incomplete)" section for manual review:
--     "dry cleaning" (EUR461.00), "crew unifotms- 2 t shirts for captain"
--     (EUR140.00), 3x "traveling expensess stwe- Rhodes to Athans"
--     (EUR35.10, EUR27.03, EUR87.97), "salary stew- 16 days 9-24.6.26- eden"
--     (EUR2,680.00).
--   - "23 Apr 2027 stew uniforms and jacket" - the year is an obvious typo
--     (sandwiched between 27 Apr 2026 and 23 Apr 2026 rows, descending
--     order) - entered as 2026-04-23, not the literal 2027 in the sheet.
--
-- Bank reconciliation gap - LEFT AS-IS, no catch-all row added (per
-- explicit instruction): the itemized bank deposits above only reconcile
-- to ~EUR39,106.60, while the sheet's own current "Bank balance at hand"
-- is -EUR8,651.40 - a ~EUR47,758 gap. There is no mechanism in this app to
-- hide a catch-all EXPENSE row from captains/owners (unlike incomes/
-- cash_transactions, which do have that via OPENING_BALANCE_MARKER), so
-- rather than post a large "other" expense visible to everyone, or an
-- artificial negative income (breaks the "+" / non-negative assumption in
-- incomes-list.tsx), this file intentionally stops at the itemized rows
-- only. The computed Bank balance in the app will NOT match the sheet's
-- stated balance until this is addressed separately.
--
-- Cash catch-all - ADDED, per explicit instruction (unlike bank above):
-- the itemized cash rows reconcile to ~EUR683.83, short of the sheet's own
-- current "Cash balance at hand" of EUR800.76 by EUR116.93. A single
-- catch-all cash_transactions row (type 'received', OPENING_BALANCE_MARKER
-- note, dated 2026-01-01 - before any itemized cash row) closes this gap.
-- It's hidden from captains/owners the same way every other boat's
-- opening-balance row is (src/lib/balances.ts OPENING_BALANCE_MARKER),
-- and its amount is recomputed from whatever's already in the ledger each
-- time this script runs, so it stays correct even if the itemized rows
-- above are edited later.
--
-- The Cash_Flow.pdf's "CARD" rows are cash withdrawn from the bank via card
-- (entered as type 'withdrawal'); the single "CASH AT HAND" row (EUR2.56,
-- 8-Jun-2026, "refound") is cash received directly (type 'received').
--
-- Safe to re-run: deletes this script's own rows (matched by boat_id + a
-- notes marker for expenses, or by exact date+amount+source/notes tuples
-- for incomes/cash_transactions) before re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_marker text := 'mintu-bank-expenses-cash-2026-import';
  v_current_cash_balance numeric;
  v_target_cash_balance numeric := 800.76;
  v_catchall_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
  v_catchall_date date := '2026-01-01';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found (matched on lower(trim(name)) = ''mintu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes = v_catchall_marker;

  -- Also remove the 14 older "Aya deposit" rows (Jan 2025-Nov 2025) from
  -- the PREVIOUS run of this script - the user has since confirmed only
  -- the 7 rows below (Mar-Jun 2026) are correct.
  delete from public.incomes where boat_id = v_boat_id and source = 'Aya deposit' and (income_date, amount) in (
    ('2025-11-04', 30000.00),
    ('2025-10-06', 15000.00),
    ('2025-10-03', 7261.00),
    ('2025-09-02', 5000.00),
    ('2025-09-01', 10000.00),
    ('2025-07-02', 20000.00),
    ('2025-06-03', 5000.00),
    ('2025-06-04', 15000.00),
    ('2025-05-02', 10000.00),
    ('2025-04-07', 10000.00),
    ('2025-04-03', 1000.00),
    ('2025-03-03', 10000.00),
    ('2025-02-05', 20000.00),
    ('2025-02-03', 6000.00)
  );

  -- DELETE (incomes) for idempotent re-run:
  delete from public.incomes where boat_id = v_boat_id and (income_date, amount, source) in (
    ('2026-06-03', 15000.00, 'Aya deposit'),
    ('2026-05-06', 20000.00, 'Aya deposit'),
    ('2026-05-04', 4868.00, 'Aya deposit'),
    ('2026-05-05', 8500.00, 'Aya deposit'),
    ('2026-04-09', 8500.00, 'Aya deposit'),
    ('2026-03-04', 15000.00, 'Aya deposit')
  );

  delete from public.expenses where boat_id = v_boat_id and notes = v_marker;

  -- DELETE (cash_transactions) for idempotent re-run:
  delete from public.cash_transactions where boat_id = v_boat_id and (tx_date, amount, notes) in (
    ('2026-07-17', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-07-04', 1500.00, 'CARD - cash withdrawal from bank'),
    ('2026-07-03', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-07-02', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-29', 1000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-28', 600.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-24', 1000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-24', 1000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-10', 1200.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-09', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-08', 1500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-30', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-25', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-23', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-22', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-21', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-20', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-11', 1300.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-05', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-05', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-05-04', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-30', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-28', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-23', 1300.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-22', 900.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-20', 1500.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-16', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-15', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-14', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-09', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-09', 1000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-08', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-07', 1500.00, 'CARD - cash withdrawal from bank'),
    ('2026-04-06', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-03-18', 500.00, 'CARD - cash withdrawal from bank'),
    ('2026-03-16', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-03-01', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-03-01', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-03-01', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-28', 600.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-26', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-26', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-20', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-05', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-02', 1000.00, 'CARD - cash withdrawal from bank'),
    ('2026-02-02', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-01-27', 800.00, 'CARD - cash withdrawal from bank'),
    ('2026-01-16', 1500.00, 'CARD - cash withdrawal from bank'),
    ('2026-01-07', 2000.00, 'CARD - cash withdrawal from bank'),
    ('2026-06-08', 2.56, 'CASH AT HAND - refound')
  );



  -- Itemized bank deposits, from Bank_Account.pdf.
  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'Aya deposit', 15000.00, '2026-06-03', 'actual', 'approved'),
    (v_boat_id, 'Aya deposit', 20000.00, '2026-05-06', 'actual', 'approved'),
    (v_boat_id, 'Aya deposit', 4868.00, '2026-05-04', 'actual', 'approved'),
    (v_boat_id, 'Aya deposit', 8500.00, '2026-05-05', 'actual', 'approved'),
    (v_boat_id, 'Aya deposit', 8500.00, '2026-04-09', 'actual', 'approved'),
    (v_boat_id, 'Aya deposit', 15000.00, '2026-03-04', 'actual', 'approved');

  -- Itemized expenses, from Expenses.pdf.
  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status, notes) values
    (v_boat_id, '2026-07-17', 'crew food (2 persons 2 days)', 'crew_food', 'cash', 118.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Diesel', 'diesel', 'card', 967.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Laundry', 'laundry_cleaning', 'cash', 190.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Super Market', 'provisions', 'cash', 14.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Super Market', 'provisions', 'cash', 5.31, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Super Market', 'provisions', 'card', 214.64, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Mooring fee Nafplio (Kavodetes Nafplio)', 'docking_out', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-17', 'Mooring fee Nafplio (Limeniko Tameio)', 'docking_out', 'cash', 77.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-16', 'Mooring fee Spetses (Giannis Kavodetis)', 'docking_out', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-16', 'crew food', 'crew_food', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-16', 'Service Tender (Rope in engine)', 'services', 'cash', 150.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-13', 'Super Market', 'provisions', 'cash', 70.53, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-13', 'Gasoline for the tender', 'diesel', 'card', 71.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-13', 'crew food', 'crew_food', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-08', 'Mooring fee Ikaria', 'docking_out', 'cash', 44.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-08', 'Super Market', 'provisions', 'cash', 10.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-07', 'Super Market', 'provisions', 'cash', 23.93, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-07', 'Mooring fee Plomari', 'docking_out', 'cash', 10.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-06', 'Super Market', 'provisions', 'cash', 10.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-06', 'Super Market', 'provisions', 'cash', 64.05, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'dry cleaning (paid by mys)', 'laundry_cleaning', 'other', 461.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-05', 'traveling expensess stwe- Athaes to Mytilini', 'crew', 'cash', 176.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-05', 'Mooring fee Mitilini (5 days)', 'docking_out', 'card', 1107.63, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-05', 'Flowers', 'capital_expenses', 'card', 10.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-05', 'Super Market', 'provisions', 'card', 36.84, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-04', 'Captain Salary June', 'crew', 'cash', 1500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-04', 'crew food (2 persons)', 'crew_food', 'cash', 48.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-04', 'Super Market', 'provisions', 'card', 306.45, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-04', 'Turkish Flag', 'capital_expenses', 'cash', 5.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-04', 'Laundry', 'laundry_cleaning', 'cash', 12.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-03', 'Captain Salary June', 'crew', 'cash', 2000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-03', 'crew food (10 days , 2 persons)', 'crew_food', 'cash', 250.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-03', 'Spare parts (Nautilos (Ropes))', 'capital_expenses', 'cash', 100.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-03', 'Second Skipper (10 days)', 'services', 'cash', 1200.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-03', 'Flight ticket 2nd skipper', 'underway_expenses', 'cash', 123.00, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'crew unifotms- 2 t shirts for captain (paid by mys)', 'capital_expenses', 'other', 140.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-02', 'DIESEL (354lit diesel (1.7/lit))', 'diesel', 'card', 600.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-30', 'Fee Boat Inspector', 'services', 'cash', 243.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-30', 'management fees- August-September (user confirmed 2000 - note: a later version of the source sheet shows 200 for this row, user re-confirmed 2000 is correct)', 'management', 'card', 2000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-30', 'management fees- July', 'management', 'card', 1000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-29', 'laundry machine', 'repairs', 'card', 1467.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-29', 'Super market', 'provisions', 'cash', 30.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-29', 'Diver', 'repairs', 'cash', 400.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-29', 'Damages', 'repairs', 'cash', 250.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-27', 'Mooring fee Patmos (3 days)', 'docking_out', 'cash', 100.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-26', 'Mooring fee Kalymnos', 'docking_out', 'cash', 100.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'Super market', 'provisions', 'cash', 29.03, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'crew food (2 days)', 'crew_food', 'cash', 62.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'Spare Parts', 'capital_expenses', 'cash', 93.76, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'Public (Card Reader for navionics maps sdcard)', 'capital_expenses', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'Mooring fee Rodos Marina', 'docking_out', 'card', 150.00, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'traveling expensess stwe- Rhodes to Athans (paid by med yacht)', 'crew', 'other', 35.10, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'traveling expensess stwe- Rhodes to Athans (paid by med yacht)', 'crew', 'other', 27.03, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'traveling expensess stwe- Rhodes to Athans (paid by med yacht)', 'crew', 'other', 87.97, 'crew', 'approved', v_marker),
    (v_boat_id, NULL, 'salary stew- 16 days 9-24.6.26- eden (paid by med yacht)', 'crew', 'other', 2680.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'Laundry', 'laundry_cleaning', 'card', 135.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', '2nd skipper to Lesvos', 'underway_expenses', 'cash', 36.96, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'Flight ticket 2nd skipper', 'underway_expenses', 'cash', 151.62, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'Technisian for laundry machine', 'services', 'cash', 30.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'Super market', 'provisions', 'cash', 8.80, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'Mooring fee Rodos Marina', 'docking_out', 'card', 165.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-24', 'DIESEL (300.88lit diesel (1.688/lit))', 'diesel', 'card', 507.88, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-23', 'salary stew- 16 days 9-24.6.27- panos (230 per day)', 'crew', 'cash', 1000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-23', 'Service Engine ( low oil Presure)', 'services', 'cash', 150.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-21', 'crew food (2 days)', 'crew_food', 'cash', 83.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-21', 'Super market', 'provisions', 'cash', 65.70, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-20', 'Super market', 'provisions', 'card', 173.96, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-20', 'Laundry', 'laundry_cleaning', 'cash', 95.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-19', 'Mooring fee Pidy Simi', 'docking_out', 'cash', 65.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-19', 'DIESEL', 'diesel', 'card', 608.51, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-19', 'Gasoline for the tender', 'diesel', 'card', 20.02, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-19', 'Mooring fee Rodos Marina', 'docking_out', 'card', 165.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-18', 'crew food', 'crew_food', 'cash', 53.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-16', 'rent a car', 'services', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-16', 'salary- stew- May+ 5 extra days in', 'crew', 'other', 3000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-15', 'Super market', 'provisions', 'card', 182.24, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-14', 'Taxi boat Lindos', 'services', 'cash', 60.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-14', 'Super market', 'provisions', 'cash', 9.60, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-13', 'Spare parts (4 generator''s impeler)', 'capital_expenses', 'cash', 100.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-13', 'Super market', 'provisions', 'cash', 72.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-13', 'Mooring fee Rodos Marina', 'docking_out', 'card', 150.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-12', 'Super market', 'provisions', 'cash', 27.44, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-12', 'rigging inspection, lines and lazy bag installation (paid by med yacht together)', 'services', 'card', 1588.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'lazy pack repair+ poof refeel (paid by med yacht together)', 'repairs', 'card', 380.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'Farmacy', 'capital_expenses', 'cash', 20.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'front window fly bridg repair (paid by med yacht together)', 'repairs', 'card', 1115.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-11', 'CREW FOOD', 'crew_food', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-11', 'Services Simi', 'docking_out', 'card', 16.25, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-11', 'Bouy Fee Simi', 'docking_out', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-11', 'Super market', 'provisions', 'cash', 98.88, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-11', 'Super market', 'provisions', 'cash', 5.44, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'CREW FOOD', 'crew_food', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'Mooring fee Rodos Marina', 'docking_out', 'card', 150.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'New UK flag', 'capital_expenses', 'cash', 13.18, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'Super market', 'provisions', 'cash', 132.92, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-10', 'Captain Salary May', 'crew', 'cash', 500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-09', 'Taxi (Athens - airport, Rodos airport)', 'underway_expenses', 'cash', 64.69, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-09', 'Flight ticket Hostess', 'underway_expenses', 'cash', 84.62, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-09', 'Super market', 'provisions', 'card', 70.95, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-09', 'Captain Salary May', 'crew', 'cash', 1500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-09', 'Laundry', 'laundry_cleaning', 'card', 105.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'Captain Salary May', 'crew', 'cash', 1500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'CREW FOOD', 'crew_food', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'Tender Repair', 'capital_expenses', 'cash', 200.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'Spare parts for tender (New Pads + Repair kit)', 'capital_expenses', 'card', 75.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'Mooring fee Rodos Marina', 'docking_out', 'card', 315.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'DIESEL (228.33lit diesel (1.795/lit))', 'diesel', 'card', 409.85, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-08', 'Spare parts (Nautilos)', 'capital_expenses', 'cash', 37.34, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-05', 'Super market', 'provisions', 'cash', 370.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-02', 'salary stew May (paid from Eden and Tsafrir private account)', 'crew', 'other', 3000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-05', 'Super market', 'provisions', 'cash', 370.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-04', 'Tender service (Hole at the tender)', 'repairs', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-04', 'Navionics maps renewal', 'capital_expenses', 'card', 124.99, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-01', 'Taxi boat (Transfer to the boat from Simi (problem with the propeller))', 'services', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-30', 'Crew Food (3 days in Rodos)', 'crew_food', 'cash', 80.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-30', 'Taxi (3 days in Rodos)', 'underway_expenses', 'cash', 28.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-30', 'Power & water Marina Rodos', 'services', 'cash', 25.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-30', 'Super market', 'provisions', 'cash', 24.10, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-30', 'Super market', 'provisions', 'card', 297.03, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-29', 'Diesel (368.5 lit)', 'diesel', 'card', 663.67, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-28', 'Crew Food', 'crew_food', 'cash', 60.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-28', 'mooring fees Tilos', 'services', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-25', 'Gas-tolls', 'underway_expenses', 'cash', 93.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-25', 'Super market', 'provisions', 'cash', 20.99, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Super market', 'provisions', 'cash', 67.86, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Spare parts', 'services', 'cash', 54.10, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Super market', 'provisions', 'cash', 52.23, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Fry pans', 'capital_expenses', 'cash', 29.40, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Crew shoes (Bianca''s shoes)', 'capital_expenses', 'cash', 60.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-27', 'STARLINK', 'wifi_phone', 'card', 71.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Diesel (230 lit)', 'diesel', 'card', 450.34, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-23', 'Gasoline for the tender (40.5 lit)', 'diesel', 'cash', 87.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-22', 'Nespresso coffee', 'provisions', 'cash', 157.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-22', 'Laundry', 'laundry_cleaning', 'cash', 210.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-22', 'mooring fees Rodos', 'services', 'cash', 300.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'New classes', 'capital_expenses', 'cash', 136.06, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'Nespresso coffee', 'provisions', 'cash', 78.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'Electric Fan', 'capital_expenses', 'cash', 129.90, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'White cover rails', 'capital_expenses', 'cash', 127.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'Safety net + spare parts', 'capital_expenses', 'cash', 253.86, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'Super market', 'crew_food', 'cash', 41.53, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-21', 'corian repair in the cocpit sink (paid by med yacht)', 'repairs', 'cash', 450.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-17', 'Hydra Port', 'docking_out', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-17', 'Water fees Hydra', 'docking_out', 'cash', 15.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-17', 'mooring fees Hydra', 'services', 'cash', 35.40, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-16', 'Super Market Spetses', 'provisions', 'card', 48.52, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-14', 'Super market', 'provisions', 'cash', 16.33, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Mooring Lines (Previous captain damage + extension rope)', 'capital_expenses', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Provisions', 'provisions', 'card', 291.07, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Flowers', 'provisions', 'cash', 30.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Gas-tolls (2.5 weeks)', 'underway_expenses', 'cash', 145.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Crew Food', 'crew_food', 'cash', 30.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'transitlog activation+ and change captain (paid by med yacht)', 'formalities', 'cash', 250.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Sea water filter 5micron (paid by med yacht)', 'services', 'cash', 199.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'Sea water filter 20micron (paid by med yacht)', 'services', 'cash', 101.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-11', 'day worker (paid by med yacht)', 'laundry_cleaning', 'cash', 80.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-08', 'TEPAI- May-October (paid by med yacht)', 'formalities', 'cash', 640.80, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-07', 'Fuel ( 330lit Diesel + 30lit Gasoline for tender ) (Shell Neas Peramou)', 'diesel', 'card', 723.27, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-07', 'Boat cleaning bimini (Nautilos)', 'laundry_cleaning', 'cash', 24.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-07', 'Spare part (plastic net) for tender (Maratsinos)', 'capital_expenses', 'cash', 12.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-07', 'Maintenance of diving bottle (Kartelias)', 'capital_expenses', 'cash', 60.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-06', 'Spare parts (Eval)', 'capital_expenses', 'cash', 14.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-05', 'Manual toilet service (technician repair)', 'services', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-05', 'kit manual toilet service (Koronakis)', 'services', 'cash', 50.84, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-05', 'Tools + spare parts', 'capital_expenses', 'cash', 8.90, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-04', 'salary- captain- April', 'crew', 'cash', 3500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-04', 'Sewing crew''s uniform (Kentao)', 'capital_expenses', 'cash', 72.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-04', 'Crew fleece (Kartelias)', 'capital_expenses', 'cash', 120.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-02', 'Tools + spare parts (Eval)', 'capital_expenses', 'cash', 72.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-05-02', 'Anchor nautical key + flag (Emporio Mare)', 'capital_expenses', 'cash', 74.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-30', 'Crew Food (3 days)', 'crew_food', 'cash', 47.27, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-30', 'Super market Nea Peramos (Renewal of Cleaning products)', 'provisions', 'cash', 83.03, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-30', 'Bianca''s Taxi', 'underway_expenses', 'cash', 80.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-30', 'Service of 2 water heater (Antonis Marinakis)', 'services', 'cash', 480.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-30', 'Roze ( Philippine ) (2 days of her services)', 'laundry_cleaning', 'cash', 160.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-29', 'Tools + spare parts', 'capital_expenses', 'cash', 33.92, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-28', 'Medicines (Renewal of Mintu''s pharmacy)', 'capital_expenses', 'cash', 70.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-28', 'Two new aluminioum Chairs', 'capital_expenses', 'cash', 180.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-28', 'New mooring lines', 'capital_expenses', 'cash', 90.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-27', 'Teak cleaner', 'laundry_cleaning', 'cash', 448.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-23', 'stew uniforms and jacket (source sheet said 23 Apr 2027, corrected to 2026 (obvious typo, surrounded by 2026 dates))', 'capital_expenses', 'cash', 1215.57, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-23', 'anchor U repair', 'repairs', 'cash', 900.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-22', 'Head torch', 'capital_expenses', 'cash', 15.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-22', 'Crew food (3 days)', 'crew_food', 'cash', 33.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-22', 'Gas-tolls (3 days)', 'underway_expenses', 'cash', 78.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-21', 'Boat support (Local fisherman help for anchor)', 'other', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-16', 'Leroy Merlin (storage box)', 'capital_expenses', 'cash', 12.79, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-15', 'Koronakis (Spare & cleaning parts)', 'capital_expenses', 'cash', 198.64, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-14', 'Leroy Merlin (Technical supplies for the boat)', 'capital_expenses', 'cash', 51.73, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-14', 'mooring fees- Nea Peramos April- May- June- July- August-September (1155 per month)', 'base_docking', 'cash', 6930.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-09', 'Fender Covers (8+2 blue fender covers)', 'capital_expenses', 'cash', 170.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-07', 'Gas-tolls (2 days 6/4 & 7/4)', 'underway_expenses', 'cash', 55.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-07', 'Navigation pilar lights (Navigation lights for dinghy)', 'capital_expenses', 'cash', 23.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-24', 'EPIRB service', 'services', 'cash', 90.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-08', 'mannagment fees- April- June-July', 'management', 'cash', 3000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-07', 'salary- captain- March started 5.3.26', 'crew', 'cash', 3500.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-06', 'Boat support (Local fisherman help for anchor)', 'other', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-02', 'Gas-tolls', 'underway_expenses', 'cash', 30.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-04-02', 'Spare Parts (Spare parts for the fridge)', 'capital_expenses', 'cash', 140.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-31', 'Super market Nea Peramos', 'provisions', 'cash', 16.65, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-27', 'Tools (Praktiker)', 'capital_expenses', 'cash', 29.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-27', 'Gas-tolls (2 days 23/3 & 27/3)', 'underway_expenses', 'cash', 53.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-18', 'AIS & Call Sign (Data updated at Seatech)', 'capital_expenses', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-04', 'STARLINK', 'wifi_phone', 'card', 53.30, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-18', 'Insurance 22.3.26-22.3.27', 'formalities', 'card', 8881.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-17', 'Fire extinguishers and liferafts checks', 'services', 'cash', 234.63, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-16', 'skipper salary- 1-15.3.26', 'crew', 'cash', 1620.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-13', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-11', 'life raft (paid to med yacht)', 'repairs', 'card', 1030.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-09', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-03-06', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-28', 'skipper salary (120 loan)', 'crew', 'cash', 3120.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-20', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-16', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-09', 'gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-06', 'Marina Alimos extend 1 day', 'services', 'card', 161.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-06', 'Marina Alimos hauling in', 'services', 'card', 316.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-05', 'antifouling- KAVAS', 'services', 'cash', 2000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-05', 'hauling in and out- KAVAS', 'services', 'card', 2318.80, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'electronic system repair (paid)', 'repairs', 'cash', 600.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'polish and painting propspeed (paid)', 'services', 'cash', 1100.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'thasos (paid)', 'repairs', 'cash', 1000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'active marine - service on drive shaft (paid)', 'services', 'cash', 754.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'tender service engine and egzoz (paid)', 'services', 'cash', 1405.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'repair pumps on the steering- Marinos (paid)', 'repairs', 'cash', 705.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-26', 'tenderlift service- Marinos (paid)', 'services', 'cash', 700.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-06', '1 extra day in Alimos Marina shipyard- 5.2.26', 'services', 'card', 161.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-06', 'crane fees- Alimos Marina- hull in', 'services', 'card', 316.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-06', 'taxi-peramos alimos', 'underway_expenses', 'cash', 50.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-02-02', 'skipper fees (240 loan)', 'crew', 'cash', 3000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-30', 'Propspeed propeller kit,light speed for underwater', 'services', 'card', 498.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-28', 'Full body cover for dinghy dry dock', 'capital_expenses', 'cash', 49.90, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-27', 'TEPA- February', 'formalities', 'cash', 106.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-27', 'Taxi Panos', 'underway_expenses', 'cash', 70.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-27', 'gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-20', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-19', 'crane fees- Alimos Marina- hull out', 'services', 'card', 378.20, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-19', 'drydock fees- Alimos Marina 20/01/2026 - 29/01/2026', 'services', 'card', 1612.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-14', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-13', 'Floor cover for Drydock', 'services', 'cash', 38.50, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-12', 'Nautilus chemicals and cleaning stuff', 'services', 'card', 101.79, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-12', 'management fees- January- February- March', 'management', 'cash', 3000.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-07', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-01-05', 'Gas-tolls', 'underway_expenses', 'cash', 40.00, 'crew', 'approved', v_marker);

  -- Itemized cash withdrawn via card ("CARD"), from Cash_Flow.pdf.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 800.00, '2026-07-17', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1500.00, '2026-07-04', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-03', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-02', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1000.00, '2026-06-29', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 600.00, '2026-06-28', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1000.00, '2026-06-24', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1000.00, '2026-06-24', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1200.00, '2026-06-10', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-06-09', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1500.00, '2026-06-08', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-30', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-25', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-23', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-22', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-21', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-20', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1300.00, '2026-05-11', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-05-05', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-05-05', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-05-04', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 800.00, '2026-04-30', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-04-28', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1300.00, '2026-04-23', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 900.00, '2026-04-22', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1500.00, '2026-04-20', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-04-16', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-04-15', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-04-14', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-04-09', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1000.00, '2026-04-09', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-04-08', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1500.00, '2026-04-07', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-04-06', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 500.00, '2026-03-18', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-03-16', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 800.00, '2026-03-01', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 800.00, '2026-03-01', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 800.00, '2026-03-01', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 600.00, '2026-02-28', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-02-26', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-02-26', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-02-20', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-02-05', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1000.00, '2026-02-02', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-02-02', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 800.00, '2026-01-27', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 1500.00, '2026-01-16', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-01-07', 'CARD - cash withdrawal from bank', 'approved');

  -- Cash received directly ("CASH AT HAND"), from Cash_Flow.pdf.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'received', 2.56, '2026-06-08', 'CASH AT HAND - refound', 'approved');

  -- Catch-all: recompute whatever's left after the itemized rows above and
  -- plug the gap so the cash balance matches the sheet's own stated
  -- EUR800.76 "Cash balance at hand" - mirrors computeCashBalance in
  -- src/lib/balances.ts exactly (cash_transactions inflow minus cash-paid
  -- expenses), so it stays correct even if this script is re-run after the
  -- itemized rows above are edited.
  select
    coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type in ('withdrawal', 'received') and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method = 'cash' and archived_at is null), 0)
  into v_current_cash_balance;

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, v_catchall_date, v_catchall_marker, 'approved');
end $$;
