-- Independent paid-tracking per payment method, for a salary period split
-- between cash and bank (both cash_amount and bank_amount set). `paid` stays
-- the "fully settled" flag (true once both methods, when split, are marked
-- paid - or the single payment, when not split) - unchanged for every
-- existing reader of that column. These two new columns are only ever set
-- on a split period; null on every other row.
alter table public.salary_periods
  add column if not exists cash_paid_at timestamptz,
  add column if not exists bank_paid_at timestamptz;
