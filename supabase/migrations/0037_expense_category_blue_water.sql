-- ============================================================================
-- New "blue water" expense category (Nea Peramos "Blue Water" marina mooring
-- fees) - tracked separately from Base Docking in Stephanie's own budget and
-- expense records. Restricted to Stephanie only in the app layer (labels.ts),
-- same pattern as the Lulu-only project categories.
-- ============================================================================

alter type public.expense_category add value if not exists 'blue_water';
