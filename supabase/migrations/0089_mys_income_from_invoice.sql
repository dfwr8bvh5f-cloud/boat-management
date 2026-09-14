-- Links a mys_income row back to the mys_invoice it was auto-recorded from
-- when that invoice was marked paid (see addMysInvoicePayment,
-- src/lib/actions/mys.ts). Nullable - a manually-typed income row (the
-- existing flow, untouched) never sets this. Also doubles as the guard that
-- keeps a re-fired payment update (e.g. a correction payment added after
-- the invoice was already 'paid') from recording the same income twice.
alter table public.mys_income
  add column if not exists mys_invoice_id uuid references public.mys_invoices(id) on delete set null;
