-- ============================================================================
-- Payment plans (installments) for MYS expenses - the MYS-side counterpart of
-- 0072_expense_payment_plans.sql on boat expenses.
--
-- Two new columns on the existing `mys_expenses` table, both defaulted so every
-- pre-existing row (and any ordinary future insert) is completely unaffected:
--   - is_payment_plan: true ONLY on the single top-level "header" row that
--     represents the plan itself. The header is never dated and never has a
--     payment method, so every date-filtered total/report keeps ignoring it.
--     Always false on a normal expense and on every individual payment row.
--   - parent_expense_id: set on an individual PAYMENT row, pointing back at its
--     plan's header. Null on every normal expense and on the header itself.
--
-- A payment row is otherwise a completely ordinary mys_expenses row - its own
-- real amount / date / payment method / receipt, counted in totals, matched in
-- bank reconciliation and (for a "Behalf payment") mirrored onto the client's
-- ledger exactly like any single expense. The header only groups them.
--
-- `on delete cascade` removes a plan's payment rows at the DB level if the
-- header is ever deleted directly; the app-level delete (deleteMysExpensePlan)
-- deletes each payment through deleteMysExpense first so mirrored client
-- charges are cleaned up too.
--
-- Additive only: no existing column is renamed, dropped or altered. This file
-- must be reviewed and applied manually (no migration is run automatically).
-- ============================================================================

alter table public.mys_expenses
  add column if not exists is_payment_plan boolean not null default false,
  add column if not exists parent_expense_id uuid references public.mys_expenses (id) on delete cascade;

-- Speeds up "fetch every payment under this plan" - partial since the column is
-- null for the overwhelming majority of rows (every normal expense).
create index if not exists mys_expenses_parent_expense_id_idx
  on public.mys_expenses (parent_expense_id)
  where parent_expense_id is not null;
