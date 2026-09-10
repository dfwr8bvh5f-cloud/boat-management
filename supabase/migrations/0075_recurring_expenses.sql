-- ============================================================================
-- Recurring expense templates: a boat-scoped, monthly-recurring "expense to
-- suggest adding" - deliberately never auto-inserts a real expense row on
-- its own. Each month, once `next_due_date` has arrived, the Expenses page
-- shows it as a suggestion (pre-filled, editable) that has to be explicitly
-- confirmed (confirmRecurringExpense, src/lib/actions/recurring-expenses.ts)
-- before a real `expenses` row is created - or permanently stopped
-- (`active = false`) if it shouldn't keep coming back. There is no "skip
-- just this once": an unconfirmed, still-active template simply keeps
-- showing as due until she acts on it.
-- ============================================================================

create table if not exists public.expense_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  description text not null,
  invoice_number text,
  amount numeric not null,
  category public.expense_category,
  payment_method public.payment_method,
  paid_by public.paid_by_type not null default 'crew',
  is_warranty boolean not null default false,
  notes text,
  -- The calendar day this recurs on each month (1-31) - the source of truth
  -- for computing the next `next_due_date` once the current one is
  -- confirmed/advanced. A month shorter than this day clamps to that
  -- month's actual last day (see addMonthsClampedISO, src/lib/date-format.ts).
  day_of_month integer not null check (day_of_month between 1 and 31),
  next_due_date date not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_recurring_templates_boat_id_idx on public.expense_recurring_templates (boat_id);

drop trigger if exists set_updated_at on public.expense_recurring_templates;
create trigger set_updated_at before update on public.expense_recurring_templates
  for each row execute function public.set_updated_at();

alter table public.expense_recurring_templates enable row level security;

-- Same access shape as expenses itself (management everywhere; captain only
-- on their own boat) - no owner access, since this is a forward-looking
-- scheduling record, not a financial history entry.
drop policy if exists expense_recurring_templates_select on public.expense_recurring_templates;
create policy expense_recurring_templates_select on public.expense_recurring_templates for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists expense_recurring_templates_insert on public.expense_recurring_templates;
create policy expense_recurring_templates_insert on public.expense_recurring_templates for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists expense_recurring_templates_update on public.expense_recurring_templates;
create policy expense_recurring_templates_update on public.expense_recurring_templates for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists expense_recurring_templates_delete on public.expense_recurring_templates;
create policy expense_recurring_templates_delete on public.expense_recurring_templates for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- Links a confirmed expense back to the template that produced it (and, for
-- symmetry, the very first occurrence that created the template in the first
-- place) - additive and nullable, so every existing expense stays untouched.
alter table public.expenses
  add column if not exists recurring_template_id uuid references public.expense_recurring_templates (id) on delete set null;
