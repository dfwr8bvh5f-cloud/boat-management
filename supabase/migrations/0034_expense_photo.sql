-- ============================================================================
-- Second, separate attachment slot on expenses: a plain photo, alongside
-- the existing scanned invoice/receipt (receipt_path) - both can be
-- attached to the same expense at once.
-- ============================================================================

alter table public.expenses
  add column if not exists photo_path text;
