-- ============================================================================
-- One-time data import: MICHALI's bank deposits and cash movements, from
-- MICHALI_2_Bank_Account.pdf and MICHALI_2_Cash_Flow.pdf.
--
-- Same pattern as 2026-07-stephanie-bank-cash-detail.sql: enters the actual
-- dated rows shown in the two sheets as real records, then a single
-- catch-all row per ledger (bank/cash) sized to make the running balance
-- match the sheets' own stated totals - the sheets' "Total bank in"
-- (EUR469,715.52) and "Total cash in" (EUR93,906.56) are both far larger than
-- what the dated rows below sum to, meaning older/pre-2026 activity only
-- shows up as the sheets' own running totals, not individual rows. That gap
-- is covered by the catch-all, not fabricated as fake dated rows.
--
-- Cash Flow PDF has two kinds of itemized rows: "CASH AT HAND" (cash handed
-- over directly - entered as type 'received') and "CARD" (cash withdrawn via
-- card - entered as type 'withdrawal', confirmed these are real separate
-- withdrawals, not duplicates of anything in the Expenses sheet).
--
-- Safe to re-run: deletes this script's own rows (matched by exact
-- date+amount+source/notes) before re-inserting.
--
-- RUN ORDER: run 2026-07-michali-expenses.sql FIRST, then this file. The
-- catch-all calculation below sums the boat's existing expenses (by payment
-- method) to figure out what's still missing from each balance - if this
-- runs before the expenses are in, the catch-all will be wrong and need
-- re-running (safe to do - just re-run this file again after the expenses).
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_current_cash_balance numeric;
  v_target_bank_balance numeric := 80221.28;
  v_target_cash_balance numeric := -607.79;
  v_catchall_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
  v_catchall_date date := '2026-01-04';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'michali';
  if v_boat_id is null then
    raise exception 'Boat "Michali" not found (matched on lower(trim(name)) = ''michali'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and source = v_catchall_marker;
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes = v_catchall_marker;

  delete from public.incomes where boat_id = v_boat_id and (income_date, amount, source) in (
    ('2026-07-14', 74967.00, 'transfer from yehoshua'),
    ('2026-05-29', 49967.00, 'transfer from yehoshua'),
    ('2026-05-13', 29967.00, 'transfer from yehoshua'),
    ('2026-05-04', 19967.00, 'transfer from Yehoshua'),
    ('2026-04-24', 19967.00, 'transfer from Yehoshua'),
    ('2026-04-17', 5000.00, 'transfer from mys'),
    ('2026-04-01', 29967.00, 'transfer from Yehoshua'),
    ('2026-03-19', 29967.00, 'transfer from Yehoshua'),
    ('2026-03-15', 9977.00, 'transfer from Yehoshua'),
    ('2026-02-06', 9977.00, 'transfer from Yehoshua'),
    ('2026-01-20', 4977.00, 'transfer from Yehoshua')
  );

  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and (tx_date, amount, notes) in (
    ('2026-07-03', 1000.00, 'cash from yehoshua'),
    ('2026-06-16', 1000.00, 'cash from yeshohua'),
    ('2026-06-07', 1000.00, 'cash from yehoshua'),
    ('2026-05-30', 1000.00, 'cash from yehoshua'),
    ('2026-05-26', 1000.00, 'cash from yehoshua to captain'),
    ('2026-05-21', 500.00, 'cash from yehoshua to captain'),
    ('2026-04-18', 1150.00, 'Gerry to Captain Payment for expenses'),
    ('2026-05-11', 1000.00, 'cash from yehoshua to captain'),
    ('2026-05-11', 7875.00, 'Cash from Yehoshua to Eden')
  );

  delete from public.cash_transactions where boat_id = v_boat_id and type = 'withdrawal' and (tx_date, amount, notes) in (
    ('2026-04-07', 105.99, 'CARD - cash for fuse'),
    ('2026-04-02', 233.98, 'CARD - Cash for amazon order'),
    ('2026-03-23', 544.11, 'CARD - Fire extinguisher (2331 PLN)'),
    ('2026-03-23', 167.50, 'CARD - cashflow zloty (718 PLN)'),
    ('2026-01-28', 40.00, 'CARD - cash for package store'),
    ('2026-01-16', 220.00, 'CARD - Cash for Golfgear')
  );

  -- Itemized bank deposits, from Bank_Account.pdf.
  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'transfer from yehoshua', 74967.00, '2026-07-14', 'actual', 'approved'),
    (v_boat_id, 'transfer from yehoshua', 49967.00, '2026-05-29', 'actual', 'approved'),
    (v_boat_id, 'transfer from yehoshua', 29967.00, '2026-05-13', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 19967.00, '2026-05-04', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 19967.00, '2026-04-24', 'actual', 'approved'),
    (v_boat_id, 'transfer from mys', 5000.00, '2026-04-17', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 29967.00, '2026-04-01', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 29967.00, '2026-03-19', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 9977.00, '2026-03-15', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 9977.00, '2026-02-06', 'actual', 'approved'),
    (v_boat_id, 'transfer from Yehoshua', 4977.00, '2026-01-20', 'actual', 'approved');

  -- Itemized cash received directly ("CASH AT HAND"), from Cash_Flow.pdf.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'received', 1000.00, '2026-07-03', 'cash from yehoshua', 'approved'),
    (v_boat_id, 'received', 1000.00, '2026-06-16', 'cash from yeshohua', 'approved'),
    (v_boat_id, 'received', 1000.00, '2026-06-07', 'cash from yehoshua', 'approved'),
    (v_boat_id, 'received', 1000.00, '2026-05-30', 'cash from yehoshua', 'approved'),
    (v_boat_id, 'received', 1000.00, '2026-05-26', 'cash from yehoshua to captain', 'approved'),
    (v_boat_id, 'received', 500.00, '2026-05-21', 'cash from yehoshua to captain', 'approved'),
    (v_boat_id, 'received', 1150.00, '2026-04-18', 'Gerry to Captain Payment for expenses', 'approved'),
    (v_boat_id, 'received', 1000.00, '2026-05-11', 'cash from yehoshua to captain', 'approved'),
    (v_boat_id, 'received', 7875.00, '2026-05-11', 'Cash from Yehoshua to Eden', 'approved');

  -- Itemized cash withdrawn via card ("CARD"), from Cash_Flow.pdf - confirmed
  -- these are real separate withdrawals, not duplicates of Expenses.pdf rows.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 105.99, '2026-04-07', 'CARD - cash for fuse', 'approved'),
    (v_boat_id, 'withdrawal', 233.98, '2026-04-02', 'CARD - Cash for amazon order', 'approved'),
    (v_boat_id, 'withdrawal', 544.11, '2026-03-23', 'CARD - Fire extinguisher (2331 PLN)', 'approved'),
    (v_boat_id, 'withdrawal', 167.50, '2026-03-23', 'CARD - cashflow zloty (718 PLN)', 'approved'),
    (v_boat_id, 'withdrawal', 40.00, '2026-01-28', 'CARD - cash for package store', 'approved'),
    (v_boat_id, 'withdrawal', 220.00, '2026-01-16', 'CARD - Cash for Golfgear', 'approved');

  -- Recompute the catch-all for whatever's left after the itemized rows above.
  select
    coalesce((select sum(amount) from public.incomes where boat_id = v_boat_id and status = 'approved' and type = 'actual' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type = 'withdrawal' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method in ('bank_transfer', 'card') and archived_at is null), 0)
  into v_current_bank_balance;

  select
    coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type in ('withdrawal', 'received') and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method = 'cash' and archived_at is null), 0)
  into v_current_cash_balance;

  insert into public.incomes (boat_id, source, amount, income_date, type, status)
  values (v_boat_id, v_catchall_marker, v_target_bank_balance - v_current_bank_balance, v_catchall_date, 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, v_catchall_date, v_catchall_marker, 'approved');
end $$;
