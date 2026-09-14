-- A "boat_payment" MYS expense whose client name matches no real fleet boat
-- (a genuinely outside client) now also mirrors onto /mys/debts as a
-- mys_ad_hoc_charges row, the same way a real-boat match already mirrors
-- onto that boat's own expenses - see mirrorBoatPaymentExpense,
-- src/lib/actions/mys.ts. This column links the mys_expenses row to the
-- ad-hoc charge it created, mirroring linked_expense_id's role for the
-- real-boat branch (0087_mys_expense_linked_boat_expense.sql) - same
-- edit-sync/delete-cascade/delete-guard semantics, just against
-- mys_ad_hoc_charges instead of expenses.
alter table public.mys_expenses
  add column if not exists linked_ad_hoc_charge_id uuid references public.mys_ad_hoc_charges(id) on delete set null;
