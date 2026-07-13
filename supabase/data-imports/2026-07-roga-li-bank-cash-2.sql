-- ============================================================================
-- One-time data import: Roga Li's bank deposits and cash withdrawal from
-- ROGA__Bank_Account_1.pdf / ROGA__Cash_Flow_1.pdf, plus a catch-all
-- adjustment so the app's computed bank/cash balance matches the balance
-- those two sheets themselves state.
--
-- Only the rows actually visible in the two PDFs are entered as itemized,
-- dated rows. Both sheets' own running totals ("Total bank in" EUR388,593.01,
-- "Total cash from card" EUR138,350.00) are far larger than what the 3
-- itemized rows below sum to - meaning most of the underlying history isn't
-- in this export. That gap is covered by one labelled catch-all entry per
-- balance (dated one day before the earliest itemized row here, to sort
-- ahead of it), not fabricated as fake dated rows.
--
-- Safe to re-run: deletes this script's own prior catch-all + itemized rows
-- (exact date/amount/source match) before recomputing and re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_current_cash_balance numeric;
  v_target_bank_balance numeric := 21026.34;
  v_target_cash_balance numeric := 1252.31;
  v_catchall_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Remove any previous run of this script's own rows (catch-all + itemized)
  -- before recomputing and re-inserting.
  delete from public.incomes where boat_id = v_boat_id and source in (v_catchall_marker, 'left over from old account', 'transfer from Boaz');
  delete from public.cash_transactions where boat_id = v_boat_id and (
    (type = 'received' and notes = v_catchall_marker)
    or (type = 'withdrawal' and tx_date = '2026-07-13' and amount = 1000.00 and notes = 'windraw from yellow card')
  );

  -- Itemized bank deposits, from Bank_Account.pdf.
  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'transfer from Boaz', 24972.00, '2026-07-03', 'actual', 'approved'),
    (v_boat_id, 'left over from old account', 190.00, '2026-07-13', 'actual', 'approved');

  -- Itemized cash withdrawal (via card), from Cash_Flow.pdf.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 1000.00, '2026-07-13', 'windraw from yellow card', 'approved');

  -- Recompute the catch-all for whatever's left after the itemized rows
  -- above (includes any expenses/withdrawals already recorded for Roga Li
  -- from earlier imports, whatever those currently sum to).
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
  values (v_boat_id, v_catchall_marker, v_target_bank_balance - v_current_bank_balance, '2026-07-01', 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, '2026-07-01', v_catchall_marker, 'approved');
end $$;
