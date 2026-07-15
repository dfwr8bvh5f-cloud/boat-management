-- Optional, user-set date for when the issue actually happened/was noticed
-- (like expenses.expense_date) - separate from created_at, which is the
-- system timestamp of when the row was entered and stays untouched.
alter table public.issues add column if not exists issue_date date;
