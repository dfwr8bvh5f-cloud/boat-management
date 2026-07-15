-- ============================================================================
-- Let an expense's category be left unset, same as expense_date and
-- payment_method already are (0021_expense_draft_warranty.sql) - a category
-- is often not obvious right when a receipt is logged, and forcing "other"
-- as a stand-in was hiding real "needs a category" items inside a bucket
-- that's also used for genuine miscellaneous expenses.
-- ============================================================================

alter table public.expenses
  alter column category drop not null,
  alter column category drop default;
