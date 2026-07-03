-- ============================================================================
-- Extend bank statement reconciliation (0028) to also cover incoming
-- deposits and cash withdrawals, not just card/bank-transfer expenses -
-- each statement line now carries a line_type so it knows which ledger
-- (expenses / cash_transactions / incomes) to match or create against.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bank_stmt_line_type') then
    create type public.bank_stmt_line_type as enum ('expense', 'cash_withdrawal', 'income');
  end if;
end $$;

alter table public.bank_statement_lines
  add column if not exists line_type public.bank_stmt_line_type not null default 'expense';

alter table public.incomes
  add column if not exists bank_statement_line_id uuid references public.bank_statement_lines (id) on delete set null;

alter table public.cash_transactions
  add column if not exists bank_statement_line_id uuid references public.bank_statement_lines (id) on delete set null;

create index if not exists incomes_bank_statement_line_id_idx on public.incomes (bank_statement_line_id);
create index if not exists cash_transactions_bank_statement_line_id_idx on public.cash_transactions (bank_statement_line_id);
