-- ============================================================================
-- Supersedes 2026-07-stephanie-opening-balance.sql and
-- 2026-07-stephanie-opening-cash-balance.sql: instead of one lump-sum
-- catch-all for the whole balance, this enters the actual dated bank
-- deposits and cash withdrawals shown in the STEPHANIE Bank_Account.pdf /
-- Cash_Flow.pdf sheets as real records, then recomputes a SMALLER catch-all
-- for whatever isn't itemized in those sheets (older/pre-2026 activity that
-- only shows up as the sheet's own running totals, not individual rows).
--
-- Safe to run even if the two superseded scripts were already run (deletes
-- their catch-all rows first) and safe to re-run (deletes its own rows by
-- exact date+amount+source match before re-inserting, so nothing doubles).
--
-- Only the rows actually visible in the two PDFs are entered - the sheets'
-- own "Total bank in" (€1,703,220.85) and "Total cash from card"
-- (€32,924.59) are both far larger than what these 6+7 dated rows sum to,
-- meaning most of the underlying history isn't in this export (blank rows
-- above the visible ones in the source spreadsheet). That gap is still
-- covered by the catch-all at the bottom, not fabricated as fake dated rows.
--
-- The €50,000 deposit on 14-Jan-2026 is entered with its source exactly as
-- given - "???" - because that's literally what your own sheet says next
-- to it; nothing was guessed for it.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_current_cash_balance numeric;
  v_target_bank_balance numeric := 16571.17;
  v_target_cash_balance numeric := 59.81;
  v_catchall_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
  v_old_catchall_marker text := 'יתרת פתיחה 2026 - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Remove the old lump-sum catch-all rows from the two superseded scripts
  -- (both the year-agnostic marker this script now uses, and the earlier
  -- year-prefixed wording, in case an earlier run of this exact file - or
  -- one of the two superseded scripts - already inserted one).
  delete from public.incomes where boat_id = v_boat_id and source in (v_catchall_marker, v_old_catchall_marker);
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes in (v_catchall_marker, v_old_catchall_marker);

  -- Remove any previous run of THIS script's own itemized rows, matched
  -- exactly by date+amount+source, before re-inserting.
  delete from public.incomes where boat_id = v_boat_id and (income_date, amount, source) in (
    ('2026-06-25', 33740.27, 'final payment for charter 17-25.6'),
    ('2026-06-17', 14057.00, 'down payment for charter 17-25.6'),
    ('2026-05-25', 24611.50, 'final payment charter 17-22.5'),
    ('2026-04-08', 15000.00, 'roni''s deposit'),
    ('2026-03-10', 1255.55, 'transfer from NN insurance'),
    ('2026-01-14', 50000.00, '???')
  );
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'withdrawal' and (tx_date, amount, notes) in (
    ('2026-06-26', 2000.00, 'CARD'),
    ('2026-06-06', 200.00, 'CARD'),
    ('2026-05-25', 200.00, 'CARD'),
    ('2026-05-15', 600.00, 'CARD'),
    ('2026-04-30', 220.00, 'CARD'),
    ('2026-04-08', 300.00, 'CARD'),
    ('2026-04-06', 900.00, 'CARD')
  );

  -- Itemized bank deposits, from Bank_Account.pdf.
  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'final payment for charter 17-25.6', 33740.27, '2026-06-25', 'actual', 'approved'),
    (v_boat_id, 'down payment for charter 17-25.6', 14057.00, '2026-06-17', 'actual', 'approved'),
    (v_boat_id, 'final payment charter 17-22.5', 24611.50, '2026-05-25', 'actual', 'approved'),
    (v_boat_id, 'roni''s deposit', 15000.00, '2026-04-08', 'actual', 'approved'),
    (v_boat_id, 'transfer from NN insurance', 1255.55, '2026-03-10', 'actual', 'approved'),
    (v_boat_id, '???', 50000.00, '2026-01-14', 'actual', 'approved');

  -- Itemized cash withdrawals (via card), from Cash_Flow.pdf.
  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 2000.00, '2026-06-26', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 200.00, '2026-06-06', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 200.00, '2026-05-25', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 600.00, '2026-05-15', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 220.00, '2026-04-30', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 300.00, '2026-04-08', 'CARD', 'approved'),
    (v_boat_id, 'withdrawal', 900.00, '2026-04-06', 'CARD', 'approved');

  -- Recompute the catch-all for whatever's left after the itemized rows
  -- above, same self-correcting mechanism as the two superseded scripts.
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
  values (v_boat_id, v_catchall_marker, v_target_bank_balance - v_current_bank_balance, '2026-01-01', 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, '2026-01-01', v_catchall_marker, 'approved');
end $$;
