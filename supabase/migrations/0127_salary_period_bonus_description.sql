-- The "Bonus" field in the Salaries UI was renamed to "Extra" and now also
-- takes a short reason (what the extra payment is for), not just an amount -
-- see salaries-manager.tsx's SalaryEditForm. Purely additive: existing
-- salary_periods rows keep their bonus_amount with no description, which
-- the UI/expense-notes code already treats as "no reason given".
alter table public.salary_periods add column if not exists bonus_description text;
