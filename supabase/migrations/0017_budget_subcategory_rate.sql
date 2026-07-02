-- ============================================================================
-- Let a budget line item optionally be entered as a rate x duration
-- (e.g. management fee: 1400 x 12 months, docking: 1000 x 12 months)
-- instead of only a flat total. `amount` stays the source of truth for the
-- total; rate/duration are just kept alongside for display when present.
-- ============================================================================

alter table public.budget_subcategories
  add column if not exists rate numeric,
  add column if not exists duration numeric,
  add column if not exists duration_unit text;
