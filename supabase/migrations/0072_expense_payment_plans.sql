-- ============================================================================
-- Payment plans for an expense: lets a captain log an expense as "not yet
-- fully paid" (e.g. only a deposit so far), add one payment at a time (each
-- with its own amount/method/proof-of-payment file), and later "finish" the
-- plan to roll them into a single completed expense.
--
-- Two new nullable columns on the existing `expenses` table, both defaulted
-- so every pre-existing row (and any ordinary future expense insert) is
-- completely unaffected:
--   - is_payment_plan: true ONLY on the single top-level row representing
--     the plan itself (in progress or finished). Always false on a normal
--     expense and on every individual payment row.
--   - parent_expense_id: set on an individual PAYMENT row, pointing back at
--     its plan's top-level row. Null on every normal expense and on the
--     top-level row itself. `on delete cascade` so deleting a plan's header
--     deletes every payment recorded under it at the DB level - the app-level
--     delete path (deleteExpensePaymentPlan, src/lib/actions/expenses.ts)
--     additionally sweeps their Storage files first, since the DB cascade
--     only removes rows, not the receipt/photo blobs they reference.
--
-- A payment row is otherwise a completely ordinary `expenses` row - its own
-- real amount/payment_method/expense_date/status/receipt_path/photo_path,
-- going through the exact same pending/approved workflow as any expense.
-- The header row ALSO goes through that same workflow unchanged (captain
-- inserts it 'pending', management approves it once via the normal
-- approvals flow) - which is why no RLS policy below needs to change: every
-- existing policy on `expenses` keys off boat_id/status/current_role only,
-- never off these two new columns, so it already covers both new column
-- values with no edits.
-- ============================================================================

alter table public.expenses
  add column if not exists is_payment_plan boolean not null default false,
  add column if not exists parent_expense_id uuid references public.expenses (id) on delete cascade;

-- Speeds up "fetch every payment under this plan" (addExpensePlanPayment,
-- finishExpensePlan, deleteExpensePaymentPlan) - partial since the column is
-- null for the overwhelming majority of rows (every normal expense).
create index if not exists expenses_parent_expense_id_idx
  on public.expenses (parent_expense_id)
  where parent_expense_id is not null;
