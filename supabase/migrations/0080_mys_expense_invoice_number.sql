-- Adds a receipt-upload + AI scan flow to MYS Expenses, matching what every
-- boat's own expense form already has (mys_expenses.receipt_path already
-- existed but had no upload UI wired to it until now - see
-- mys-expenses-manager.tsx). invoice_number is the one field that flow can
-- fill in that mys_expenses didn't already have a column for.
alter table public.mys_expenses
  add column if not exists invoice_number text null;
