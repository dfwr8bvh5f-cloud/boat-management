-- ============================================================================
-- Data fix (no schema change): income rows auto-recorded from MYS invoice
-- payments never received the payment's method, so they were skipped by
-- /mys/income's payment-method summary and method filter (both ignore rows
-- with no method). This copies the method from the payment each income row
-- was recorded from. Only fills rows where the income has NO method yet and
-- the payment HAS one - nothing is overwritten, nothing is guessed.
-- Safe to re-run.
-- ============================================================================

-- 1) Preview: what will change
select i.invoice_number, m.income_date, m.amount, m.payment_method as income_method_now, p.payment_method as will_become
from public.mys_income m
join public.mys_invoice_payments p on p.mys_income_id = m.id
join public.mys_invoices i on i.id = p.invoice_id
where m.payment_method is null and p.payment_method is not null
order by m.income_date, i.invoice_number;

-- 2) Apply
update public.mys_income m
set payment_method = p.payment_method
from public.mys_invoice_payments p
where p.mys_income_id = m.id
  and m.payment_method is null
  and p.payment_method is not null;
