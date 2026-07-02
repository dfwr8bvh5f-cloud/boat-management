-- ============================================================================
-- Add a free-text notes field to expenses.
-- ============================================================================

alter table public.expenses
  add column if not exists notes text;
