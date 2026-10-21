-- Monthly loan repayment tracking: a loan can specify how much is deducted
-- each month (monthly_repayment). salary_periods records what's actually
-- being deducted that specific month (loan_repayment_amount - pre-filled
-- from the active loan's monthly_repayment in the UI, but editable) and
-- which repayment row marking the period paid created
-- (linked_loan_repayment_id) - the same linked_*_expense_id pattern
-- already used for the salary payment itself, so unmarking paid can
-- reverse it cleanly. salary_period_id on staff_loan_repayments ties an
-- auto-created repayment back to the month that created it; a repayment
-- added manually from the Loans panel leaves it null.

alter table public.staff_loans add column if not exists monthly_repayment numeric;

alter table public.staff_loan_repayments add column if not exists salary_period_id uuid references public.salary_periods (id) on delete set null;

alter table public.staff_loan_repayments
  drop constraint if exists staff_loan_repayments_salary_period_unique;
alter table public.staff_loan_repayments
  add constraint staff_loan_repayments_salary_period_unique unique (salary_period_id);

alter table public.salary_periods add column if not exists loan_repayment_amount numeric;
alter table public.salary_periods add column if not exists linked_loan_repayment_id uuid references public.staff_loan_repayments (id) on delete set null;
