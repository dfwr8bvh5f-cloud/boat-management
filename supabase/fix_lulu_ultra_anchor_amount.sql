-- Fixes a transcription typo from the original PDF-based bulk import: the
-- "ultra anchor" expense (ULTRA MARINE EUROPE, 30.10.2025) was entered as
-- EUR 4,226.30, but the actual bank statement shows EUR 4,266.30. Run once
-- in the Supabase SQL editor.
update public.expenses
set amount = 4266.30
where description = 'ultra anchor'
  and expense_date = '2025-10-30'
  and amount = 4226.30;
