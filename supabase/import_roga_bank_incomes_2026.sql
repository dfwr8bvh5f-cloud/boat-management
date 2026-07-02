-- One-time import of ROGA LI's bank deposits (from ROGA__Bank_Account.pdf)
-- into the app's "Bank" tab (public.incomes, type = 'actual').
-- Run this once in the Supabase SQL editor.

insert into public.incomes
  (boat_id, source, amount, income_date, type, status)
values
  ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 'Transfer from sea yam account', 24526.55, DATE '2026-05-27', 'actual', 'approved'),
  ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 'Transfer from Boaz', 24962.00, DATE '2026-05-06', 'actual', 'approved'),
  ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 'Transfer from Boaz', 9982.00, DATE '2026-04-23', 'actual', 'approved'),
  ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 'Transfer from Boaz', 49952.00, DATE '2026-01-28', 'actual', 'approved'),
  ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 'Transfer from Boaz', 24972.00, DATE '2025-12-29', 'actual', 'approved');

-- Optional: the same PDF also states the current bank balance as €4,360.62.
-- Uncomment and run this separately if you also want to set that as the
-- boat's live "Bank balance" figure shown at the top of the Bank tab
-- (it's a single manually-set number, not calculated from the incomes above).
--
-- insert into public.bank_balances (boat_id, balance, updated_at)
-- values ('193bdf92-8c6f-4665-a95c-57d3ab3cb105', 4360.62, now())
-- on conflict (boat_id) do update set balance = excluded.balance, updated_at = excluded.updated_at;

-- Verification: run this afterwards to confirm the import.
-- Expected: count = 5, total = €134,394.55
select count(*) as row_count, sum(amount) as total_amount
from public.incomes
where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105'
  and type = 'actual'
  and source like 'Transfer from%';
