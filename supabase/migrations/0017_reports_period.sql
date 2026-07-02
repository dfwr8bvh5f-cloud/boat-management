-- ============================================================================
-- Let a financial/technical report cover an arbitrary date range instead of
-- only a calendar month. Adds period_start/period_end and backfills them
-- for existing month-based reports; `month` becomes optional going forward
-- (kept only as a legacy fallback label for old rows).
-- ============================================================================

alter table public.reports
  add column if not exists period_start date,
  add column if not exists period_end date;

update public.reports
set
  period_start = (month || '-01')::date,
  period_end = ((date_trunc('month', (month || '-01')::date) + interval '1 month - 1 day'))::date
where period_start is null and month ~ '^\d{4}-\d{2}$';

alter table public.reports alter column month drop not null;
