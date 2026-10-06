-- ============================================================================
-- Lets more than one invoice attach to the same MYS income row - same one-
-- to-many shape as mys_expense_attachments (0109_mys_expense_attachments.sql)
-- and mys_ad_hoc_charge_attachments (0104_mys_ad_hoc_charge_attachments.sql).
-- mys_income.invoice_path stays as the legacy single-file column (first
-- file, for backward compatibility with anything still reading it
-- directly); every file (including that first one) also gets a row here.
-- ============================================================================

create table if not exists public.mys_income_attachments (
  id uuid primary key default gen_random_uuid(),
  mys_income_id uuid not null references public.mys_income (id) on delete cascade,
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_income_attachments_income_id_idx
  on public.mys_income_attachments (mys_income_id);

alter table public.mys_income_attachments enable row level security;

drop policy if exists mys_income_attachments_all on public.mys_income_attachments;
create policy mys_income_attachments_all on public.mys_income_attachments
  for all using (public.is_management()) with check (public.is_management());
