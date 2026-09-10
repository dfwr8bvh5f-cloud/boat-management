-- ============================================================================
-- MYS bank statement reconciliation - the same mechanism each boat already
-- has for its own expenses (see 0028_bank_statement_reconciliation.sql,
-- 0029_bank_statement_line_type.sql, 0036_reconciliation_archive_and_statement_files.sql),
-- mirrored here for MYS's own company expenses (mys_expenses) instead of
-- generalizing the boat-scoped tables - bank_statement_lines.boat_id is a
-- `not null references boats(id)` FK, and every existing reconciliation
-- action/route branches across three boat-owned ledgers (expenses/
-- cash_transactions/incomes) that have no MYS equivalent. A parallel set of
-- mys_*-prefixed tables avoids touching that already-hardened boat code
-- path at all.
--
-- Scope: mys_expenses only (no mys_income matching yet) - mirrors how boat
-- reconciliation's primary ledger is expenses too, and matches the actual
-- request ("the new page" = MYS Expenses). A bank line that turns out to be
-- a deposit will just show unmatched, which is correct until mys_income is
-- wired in too.
--
-- RLS: same is_management()-only pattern already used by every mys_* table
-- (see 0073_mys_module.sql) - no boat_id, no captain/owner branch.
-- Storage: reuses the existing "bank-statements" bucket (already
-- is_management()-only with no path restriction, see 0036) under a "mys/"
-- prefix - same convention createMysExpenseUploadUrl already uses in the
-- shared "receipts" bucket. No bucket/policy changes needed.
-- ============================================================================

create table if not exists public.mys_bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tx_date date not null,
  description text not null,
  amount numeric not null,
  statement_order int not null,
  line_type public.bank_stmt_line_type not null default 'expense',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.mys_bank_statement_files (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

alter table public.mys_expenses
  add column if not exists bank_statement_line_id uuid references public.mys_bank_statement_lines (id) on delete set null,
  add column if not exists archived_at timestamptz null;

create index if not exists mys_expenses_bank_statement_line_id_idx on public.mys_expenses (bank_statement_line_id);
create index if not exists mys_expenses_archived_at_idx on public.mys_expenses (archived_at) where archived_at is not null;

alter table public.mys_bank_statement_lines enable row level security;
alter table public.mys_bank_statement_files enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['mys_bank_statement_lines', 'mys_bank_statement_files']
  loop
    execute format('drop policy if exists %I_all on public.%I;', t, t);
    execute format(
      'create policy %I_all on public.%I for all using (public.is_management()) with check (public.is_management());',
      t, t
    );
  end loop;
end $$;
