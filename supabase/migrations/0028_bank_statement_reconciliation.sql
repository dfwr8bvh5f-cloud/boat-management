-- ============================================================================
-- Bank statement reconciliation: upload a bank statement (PDF), AI-extract
-- its outgoing transactions, and try to auto-match each one against an
-- existing card/bank_transfer expense (by amount + a small date window).
-- Unmatched lines/expenses surface as an in-app + push alert so nothing
-- gets missed. `statement_order` lets the Expenses list show matched
-- expenses in the same sequence as the statement, instead of just by date.
-- ============================================================================

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  tx_date date not null,
  description text not null,
  amount numeric not null,
  statement_order int not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bank_statement_lines_boat_id_idx on public.bank_statement_lines (boat_id);

alter table public.expenses
  add column if not exists bank_statement_line_id uuid references public.bank_statement_lines (id) on delete set null;

create index if not exists expenses_bank_statement_line_id_idx on public.expenses (bank_statement_line_id);

alter table public.bank_statement_lines enable row level security;

drop policy if exists bank_statement_lines_select on public.bank_statement_lines;
create policy bank_statement_lines_select on public.bank_statement_lines for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists bank_statement_lines_insert on public.bank_statement_lines;
create policy bank_statement_lines_insert on public.bank_statement_lines for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists bank_statement_lines_update on public.bank_statement_lines;
create policy bank_statement_lines_update on public.bank_statement_lines for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists bank_statement_lines_delete on public.bank_statement_lines;
create policy bank_statement_lines_delete on public.bank_statement_lines for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );
