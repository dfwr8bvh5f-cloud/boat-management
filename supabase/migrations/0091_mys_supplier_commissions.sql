-- ============================================================================
-- Supplier commission tracking: she uploads a supplier's invoice, sets the
-- commission she's owed on it (by percent of the invoice, or by typing the
-- final commission amount directly - same percent/price toggle as the
-- boat_payment markup UI on mys_expenses), optionally adds VAT on top of
-- the commission itself, and once she approves it, it becomes an open
-- receivable that shows on /mys/debts (as a 4th debt-row kind) until it's
-- marked paid.
--
--   - mys_suppliers: a small, name-only pick list for the supplier field -
--     same shape/role as mys_clients (0074_mys_clients_and_income_fields.sql)
--     for the debts-page client picker, deliberately not a foreign key
--     target so a picked name is just a suggestion, not a hard relationship.
--   - mys_supplier_commissions: one row per commission. status walks
--     draft -> unpaid -> paid: a draft isn't on the debts list yet (she's
--     still previewing/adjusting it); approving it flips it to 'unpaid'
--     (the same "open receivable" meaning mys_ad_hoc_charges' own unpaid
--     status already carries); marking it paid removes it from the open
--     list, same lifecycle shape as mys_ad_hoc_charges.
--   - mys_supplier_commission_attachments: the uploaded supplier invoice
--     file(s) - same shape as expense_attachments/issue_attachments
--     (0049/0041), a dedicated table rather than a single-path column since
--     she can attach more than one file to the same commission.
-- ============================================================================

create table if not exists public.mys_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mys_suppliers enable row level security;
drop policy if exists mys_suppliers_all on public.mys_suppliers;
create policy mys_suppliers_all on public.mys_suppliers for all using (public.is_management()) with check (public.is_management());

create table if not exists public.mys_supplier_commissions (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  invoice_date date,
  -- The supplier's own invoice total - the base the commission is computed
  -- from, never itself owed to anyone.
  invoice_amount numeric not null,
  -- Always both stored regardless of which one she typed - whichever mode
  -- she used, the server recomputes the other from it (never trusts a
  -- client-sent pair to already agree), same rule client_price/markup_percent
  -- already follow on mys_expenses' boat_payment rows.
  commission_percent numeric not null,
  commission_amount numeric not null,
  -- Optional VAT on the commission itself (not on the supplier's invoice) -
  -- null/0 means no VAT line at all, matching mys_invoices.vat_amount's own
  -- "0 means none" convention.
  vat_percent numeric,
  vat_amount numeric not null default 0,
  -- commission_amount + vat_amount - what actually shows as owed once this
  -- is approved onto /mys/debts.
  total_amount numeric not null,
  status text not null default 'draft' check (status in ('draft', 'unpaid', 'paid')),
  paid_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mys_supplier_commissions_status_idx on public.mys_supplier_commissions (status);

drop trigger if exists set_updated_at on public.mys_supplier_commissions;
create trigger set_updated_at before update on public.mys_supplier_commissions
  for each row execute function public.set_updated_at();

alter table public.mys_supplier_commissions enable row level security;
drop policy if exists mys_supplier_commissions_all on public.mys_supplier_commissions;
create policy mys_supplier_commissions_all on public.mys_supplier_commissions for all using (public.is_management()) with check (public.is_management());

create table if not exists public.mys_supplier_commission_attachments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.mys_supplier_commissions (id) on delete cascade,
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_supplier_commission_attachments_commission_id_idx
  on public.mys_supplier_commission_attachments (commission_id);

alter table public.mys_supplier_commission_attachments enable row level security;
drop policy if exists mys_supplier_commission_attachments_all on public.mys_supplier_commission_attachments;
create policy mys_supplier_commission_attachments_all on public.mys_supplier_commission_attachments
  for all using (public.is_management()) with check (public.is_management());

-- No new storage bucket/policy needed - same "receipts" bucket + "mys/" path
-- prefix convention every other MYS upload already uses (see
-- createMysExpenseUploadUrl), already fully covered by management's existing
-- unrestricted access to that bucket (0002_expenses_budget.sql).
