-- ============================================================================
-- MYS expenses: recurring templates, mirroring boats' own
-- expense_recurring_templates (0075_recurring_expenses.sql) but scoped to
-- mys_expenses instead of a boat's expenses - same "suggest, never
-- auto-insert" mechanism (see confirmMysRecurringExpense,
-- src/lib/actions/mys-recurring-expenses.ts): once next_due_date arrives,
-- /mys/expenses shows it as an editable suggestion that has to be
-- explicitly confirmed before a real mys_expenses row is created, or
-- permanently stopped (active = false) if it shouldn't keep coming back.
-- Management-only, same as every other mys_* table (no captain/owner access
-- - this module has none).
-- ============================================================================

create table if not exists public.mys_expense_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  category public.mys_expense_category,
  subcategory text,
  description text not null,
  invoice_number text,
  amount numeric not null,
  payment_method public.payment_method,
  -- "boat_payment" category only - same fields/meaning as mys_expenses'
  -- own client_name/markup_percent (see readMysExpenseFields,
  -- src/lib/actions/mys.ts). client_price is never stored here; it's
  -- always recomputed at confirm time from amount * (1 + markup%/100).
  client_name text,
  markup_percent numeric,
  notes text,
  -- The calendar day this recurs on each month (1-31) - the source of
  -- truth for computing the next next_due_date once the current one is
  -- confirmed/advanced. A month shorter than this day clamps to that
  -- month's actual last day (see addMonthsClampedISO, src/lib/date-format.ts).
  day_of_month integer not null check (day_of_month between 1 and 31),
  next_due_date date not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.mys_expense_recurring_templates;
create trigger set_updated_at before update on public.mys_expense_recurring_templates
  for each row execute function public.set_updated_at();

alter table public.mys_expense_recurring_templates enable row level security;

drop policy if exists mys_expense_recurring_templates_all on public.mys_expense_recurring_templates;
create policy mys_expense_recurring_templates_all on public.mys_expense_recurring_templates
  for all using (public.is_management()) with check (public.is_management());

-- Links a confirmed mys_expenses row back to the template that produced it -
-- additive and nullable, so every existing row stays untouched.
alter table public.mys_expenses
  add column if not exists recurring_template_id uuid references public.mys_expense_recurring_templates (id) on delete set null;
