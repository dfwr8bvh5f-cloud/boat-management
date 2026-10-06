-- Adds payment_method to mys_invoice_payments, matching the column
-- mys_debt_settlements already has (0093_mys_debt_settlements.sql) - the
-- "record payment" form for an invoice currently has nowhere to even send
-- a payment method, unlike the equivalent form for a plain charge/ad-hoc
-- debt. Purely additive (new nullable column) - no existing data touched.
alter table public.mys_invoice_payments
  add column if not exists payment_method public.payment_method;
