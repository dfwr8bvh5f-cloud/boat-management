-- Lets several open MYS debts (a boat's own paid_by='management' expense,
-- or an mys_ad_hoc_charges row) be combined into one invoice, with a VAT
-- percentage chosen per line - see createMysInvoiceFromDebts in
-- src/lib/actions/mys.ts.
--
-- amount on mys_invoices keeps its existing meaning (subtotal, pre-VAT).
-- vat_amount defaults to 0, so every invoice created by the existing plain
-- single-line form (amount typed directly, no lines row at all) is
-- unaffected: amount + vat_amount is still just amount, exactly as before.
-- A combined invoice's amount/vat_amount are always the sum of its lines,
-- computed server-side.
--
-- source_type/source_id on mys_invoice_lines trace a line back to the real
-- expenses row or mys_ad_hoc_charges row it was billed from - both null
-- for a manually-typed invoice line (the existing form never writes any
-- lines at all). mys_invoice_id / invoice_id on the source tables mark a
-- debt as already invoiced (excluded from the open-debts queries on
-- /mys/debts once set); voiding an invoice clears them back to null so the
-- debt reappears as open, while the mys_invoice_lines rows themselves stay
-- as an audit trail.

alter table public.mys_invoices
  add column if not exists vat_amount numeric not null default 0;

create table if not exists public.mys_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mys_invoices (id) on delete cascade,
  description text not null,
  amount numeric not null,
  vat_percent numeric not null default 0,
  vat_amount numeric not null default 0,
  source_type text check (source_type in ('charge', 'ad_hoc')),
  source_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists mys_invoice_lines_invoice_id_idx on public.mys_invoice_lines (invoice_id);

alter table public.expenses
  add column if not exists mys_invoice_id uuid references public.mys_invoices (id) on delete set null;

alter table public.mys_ad_hoc_charges
  add column if not exists invoice_id uuid references public.mys_invoices (id) on delete set null;

create index if not exists expenses_mys_invoice_id_idx on public.expenses (mys_invoice_id) where mys_invoice_id is not null;
create index if not exists mys_ad_hoc_charges_invoice_id_idx on public.mys_ad_hoc_charges (invoice_id) where invoice_id is not null;

alter table public.mys_invoice_lines enable row level security;

drop policy if exists mys_invoice_lines_all on public.mys_invoice_lines;
create policy mys_invoice_lines_all on public.mys_invoice_lines
  for all using (public.is_management()) with check (public.is_management());
