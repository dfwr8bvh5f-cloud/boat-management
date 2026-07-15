-- ============================================================================
-- Follow-up to 2026-07-stephanie-bank-cash-detail.sql: 2 more dated rows that
-- now appear in STEPHANIE Bank_Account.pdf / Cash_Flow.pdf (dated after that
-- script's cutoff) but are missing from the app, found by comparing those
-- PDFs against the app's own Bank/Cash CSV exports. DATA only, not a schema
-- change. Safe to re-run: deletes these exact rows (by date+amount+source/
-- notes) before re-inserting.
--
-- Does NOT touch the opening-balance catch-all row from the previous
-- script - recomputing it needs your current real bank/cash balance as of
-- today, which wasn't given for this pass.
--
-- NOT included: a "14-Jul-2026 final payment for charter 4-11.7.26" deposit
-- listed in Bank_Account.pdf at EUR2,405,550.00. Every other charter payment
-- in your sheet is in the low tens of thousands, and this one is also >100x
-- bigger than the sheet's own "Total bank in" summary for the whole period -
-- almost certainly a typo (extra digits / misplaced decimal) rather than a
-- real 2.4-million-euro payment. Not entered as-is to avoid inserting a
-- fabricated-looking figure into a live financial system - please confirm
-- the correct amount and it can be added in a follow-up script.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and (income_date, amount, source) in (
    ('2026-07-03', 13050.00, 'deposit for charter 4-11.7.26')
  );
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'withdrawal' and (tx_date, amount, notes) in (
    ('2026-07-06', 2000.00, 'CARD')
  );

  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'deposit for charter 4-11.7.26', 13050.00, '2026-07-03', 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-06', 'CARD', 'approved');
end $$;
