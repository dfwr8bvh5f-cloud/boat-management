-- Tracks partial payments against an mys_invoices row instead of only a
-- single blind "mark paid" click - see addMysInvoicePayment,
-- src/lib/actions/mys.ts. No new status enum value: "partially paid" is
-- inferred (status stays 'sent' while sum(payments) < amount + vat_amount),
-- and the invoice flips to 'paid' the moment a payment brings the sum up to
-- (or past) that total - same status column mys_invoices already had.
create table if not exists public.mys_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mys_invoices (id) on delete cascade,
  amount numeric not null,
  paid_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_invoice_payments_invoice_id_idx on public.mys_invoice_payments (invoice_id);

alter table public.mys_invoice_payments enable row level security;

drop policy if exists mys_invoice_payments_all on public.mys_invoice_payments;
create policy mys_invoice_payments_all on public.mys_invoice_payments
  for all using (public.is_management()) with check (public.is_management());
