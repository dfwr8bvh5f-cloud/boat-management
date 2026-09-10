-- ============================================================================
-- Redesign MYS's own expense categories into the four groups requested
-- (salaries / taxes / bills / boat payment, plus a fallback "other"),
-- replacing the original salaries/rent/insurance/marketing/software/
-- professional_fees/other set. The mys_expenses table was empty at the time
-- this migration was written, so the enum is safely replaced rather than
-- data-migrated - but the remapping below is defensive rather than assumed,
-- in case a row was added since.
--
-- "taxes" and "bills" each have a fixed picklist of subcategories (social
-- insurance/VAT/company tax/income tax, and car/phone/electricity/rent
-- respectively) - stored as free text in the new `subcategory` column
-- rather than their own enum, same as mys_income.category already being
-- plain text; the fixed lists themselves live in code
-- (src/lib/labels.ts).
--
-- "boat payment" is a new kind of MYS expense: MYS buys something on behalf
-- of a specific boat/client at cost (the existing `amount` column), then
-- resells it to that boat/client at a markup. `client_name` reuses the
-- exact same boats+mys_clients picker as mys_income.client_name (see
-- 0074_mys_clients_and_income_fields.sql); `markup_percent` is the
-- percentage applied, and `client_price` is the resulting price to charge -
-- always computed server-side from amount and markup_percent
-- (createMysExpense/updateMysExpense, src/lib/actions/mys.ts), never
-- trusted from the client directly.
-- ============================================================================

alter table public.mys_expenses alter column category drop default;
alter table public.mys_expenses alter column category type text using category::text;
drop type public.mys_expense_category;

create type public.mys_expense_category as enum ('salaries', 'taxes', 'bills', 'boat_payment', 'other');

alter table public.mys_expenses alter column category type public.mys_expense_category using (
  case category
    when 'salaries' then 'salaries'
    else 'other'
  end
)::public.mys_expense_category;
alter table public.mys_expenses alter column category set default 'other';

alter table public.mys_expenses
  add column if not exists subcategory text,
  add column if not exists client_name text,
  add column if not exists markup_percent numeric,
  add column if not exists client_price numeric;
