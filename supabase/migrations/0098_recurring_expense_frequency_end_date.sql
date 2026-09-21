-- ============================================================================
-- Recurring expense templates (both the boat-side expense_recurring_templates
-- and MYS's own mys_expense_recurring_templates - the same mechanism, kept
-- in lockstep) gain:
--   - frequency: was implicitly always monthly; now an explicit choice
--     (weekly/monthly/quarterly/yearly), defaulted to 'monthly' so every
--     existing template keeps behaving exactly as it already does.
--   - end_date: optional - when set, confirming an occurrence that would
--     advance next_due_date past end_date auto-stops the template (active
--     = false) instead of continuing forever. Null (the default) means
--     open-ended, same as today's actual behavior.
-- day_of_month (already on both tables) stays the source of truth for
-- monthly/quarterly/yearly; it's simply unused for weekly, which advances
-- by exactly 7 days from whatever date the current occurrence lands on.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'recurrence_frequency') then
    create type public.recurrence_frequency as enum ('weekly', 'monthly', 'quarterly', 'yearly');
  end if;
end $$;

alter table public.expense_recurring_templates
  add column if not exists frequency public.recurrence_frequency not null default 'monthly',
  add column if not exists end_date date;

alter table public.mys_expense_recurring_templates
  add column if not exists frequency public.recurrence_frequency not null default 'monthly',
  add column if not exists end_date date;
