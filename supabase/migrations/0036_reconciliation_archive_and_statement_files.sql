-- ============================================================================
-- Two additions to bank reconciliation, both purely additive:
--
-- 1. "Archived" flag on expenses/incomes/cash_transactions. Lets management
--    pull an unmatched record out of the reconciliation "not found on
--    statement" list and out of every financial total/report, WITHOUT
--    deleting it - it stays in the database so a future statement scan can
--    still match it. Archiving is a manual, reversible action (unarchive
--    just clears the timestamp); nothing here auto-archives anything.
--
-- 2. bank_statement_files: keeps the actual uploaded statement file (not
--    just the AI-extracted lines) so it can be reopened/downloaded later,
--    the same way expense receipts already work.
-- ============================================================================

alter table public.expenses
  add column if not exists archived_at timestamptz null;

alter table public.cash_transactions
  add column if not exists archived_at timestamptz null;

alter table public.incomes
  add column if not exists archived_at timestamptz null;

-- Only ever queried alongside boat_id/status, so a partial index (excluding
-- the common case of archived_at being null) keeps it small and useful only
-- for the "find my archived records" lookup, without slowing down every
-- other query on these tables with an extra column to maintain.
create index if not exists expenses_archived_at_idx on public.expenses (boat_id) where archived_at is not null;
create index if not exists cash_transactions_archived_at_idx on public.cash_transactions (boat_id) where archived_at is not null;
create index if not exists incomes_archived_at_idx on public.incomes (boat_id) where archived_at is not null;

create table if not exists public.bank_statement_files (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists bank_statement_files_boat_id_idx on public.bank_statement_files (boat_id);

alter table public.bank_statement_files enable row level security;

-- Same management-only scope as the rest of bank reconciliation (see
-- 0030_bank_reconciliation_management_only.sql).
drop policy if exists bank_statement_files_select on public.bank_statement_files;
create policy bank_statement_files_select on public.bank_statement_files for select
  using (public.is_management());

drop policy if exists bank_statement_files_insert on public.bank_statement_files;
create policy bank_statement_files_insert on public.bank_statement_files for insert
  with check (public.is_management());

drop policy if exists bank_statement_files_delete on public.bank_statement_files;
create policy bank_statement_files_delete on public.bank_statement_files for delete
  using (public.is_management());

-- ----------------------------------------------------------------------------
-- Storage: private bucket for the uploaded statement files themselves.
-- Same path convention and access pattern as the "receipts" bucket
-- (0002_expenses_budget.sql): "<boat_id>/filename.ext", management-only here
-- since bank reconciliation itself is management-only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bank-statements', 'bank-statements', false)
on conflict (id) do nothing;

drop policy if exists bank_statements_storage_select on storage.objects;
create policy bank_statements_storage_select on storage.objects for select
  using (bucket_id = 'bank-statements' and public.is_management());

drop policy if exists bank_statements_storage_insert on storage.objects;
create policy bank_statements_storage_insert on storage.objects for insert
  with check (bucket_id = 'bank-statements' and public.is_management());

drop policy if exists bank_statements_storage_delete on storage.objects;
create policy bank_statements_storage_delete on storage.objects for delete
  using (bucket_id = 'bank-statements' and public.is_management());
