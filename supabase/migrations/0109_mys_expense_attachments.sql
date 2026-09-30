-- ============================================================================
-- Lets more than one invoice/receipt attach to the same MYS expense - same
-- one-to-many shape as mys_ad_hoc_charge_attachments
-- (0104_mys_ad_hoc_charge_attachments.sql) and the boat side's own
-- expense_attachments. mys_expenses.receipt_path stays as the legacy
-- single-file column (first file, for backward compatibility with
-- anything still reading it directly - mirrorBoatPaymentExpense, report
-- generation); every file (including that first one) also gets a row here.
-- ============================================================================

create table if not exists public.mys_expense_attachments (
  id uuid primary key default gen_random_uuid(),
  mys_expense_id uuid not null references public.mys_expenses (id) on delete cascade,
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_expense_attachments_expense_id_idx
  on public.mys_expense_attachments (mys_expense_id);

alter table public.mys_expense_attachments enable row level security;

drop policy if exists mys_expense_attachments_all on public.mys_expense_attachments;
create policy mys_expense_attachments_all on public.mys_expense_attachments
  for all using (public.is_management()) with check (public.is_management());
