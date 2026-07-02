-- Diagnostic: see exactly what the app's bank-balance formula is summing for
-- ROGA LI, so we can see why the Bank tab shows a negative number.
-- Formula: approved incomes (type=actual) - approved cash withdrawals
--          - approved expenses paid by bank_transfer/card.

-- 1) Total approved deposits (incomes)
select 'incomes (actual, approved)' as label, count(*) as row_count, coalesce(sum(amount), 0) as total
from public.incomes
where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105'
  and status = 'approved'
  and type = 'actual';

-- 2) Total approved cash withdrawals (money pulled OUT of the bank into cash)
select 'cash withdrawals (approved)' as label, count(*) as row_count, coalesce(sum(amount), 0) as total
from public.cash_transactions
where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105'
  and status = 'approved'
  and type = 'withdrawal';

-- 3) Total approved expenses paid by bank transfer or card
select 'expenses paid by bank/card (approved)' as label, count(*) as row_count, coalesce(sum(amount), 0) as total
from public.expenses
where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105'
  and status = 'approved'
  and payment_method in ('bank_transfer', 'card');

-- 4) Breakdown of ALL approved expenses by payment method (to spot mis-tagged rows)
select payment_method, count(*) as row_count, coalesce(sum(amount), 0) as total
from public.expenses
where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105'
  and status = 'approved'
group by payment_method
order by payment_method;

-- 5) The computed bank balance itself (should match what the app shows)
select
  (select coalesce(sum(amount), 0) from public.incomes
     where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105' and status = 'approved' and type = 'actual')
  -
  (select coalesce(sum(amount), 0) from public.cash_transactions
     where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105' and status = 'approved' and type = 'withdrawal')
  -
  (select coalesce(sum(amount), 0) from public.expenses
     where boat_id = '193bdf92-8c6f-4665-a95c-57d3ab3cb105' and status = 'approved'
       and payment_method in ('bank_transfer', 'card'))
  as computed_bank_balance;
