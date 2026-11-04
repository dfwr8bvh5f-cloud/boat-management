-- A "Project 2027" expense category, shown only for MINTU (the app hides it
-- for every other boat, but enum values are global). Its budget lives in the
-- normal budget_categories table (category = 'project_2027') but the app keeps
-- it out of the boat's annual budget totals (see SEPARATE_BUDGET_CATEGORIES in
-- src/lib/labels.ts). Additive only: one new enum value, no row changes.
alter type public.expense_category add value if not exists 'project_2027';
