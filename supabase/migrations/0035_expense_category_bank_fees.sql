-- ============================================================================
-- New "bank fees" expense category, available to all boats (unlike the
-- Lulu-only project categories).
-- ============================================================================

alter type public.expense_category add value if not exists 'bank_fees';
