-- Recurring management-fee billing reminder: one row per boat she bills a
-- fixed management fee to. On /mys, a popup lists every boat whose fee is
-- due today (see src/lib/mys-management-fees.ts for the pure date logic
-- and src/app/(app)/mys/page.tsx for where it's evaluated) and lets her
-- create the real charge(s) with one click.
--
-- frequency='monthly': fires every month, on trigger_day (a fixed day like
-- MA BELLE's 10th) or, when trigger_day is null, on the last calendar day
-- of the month (STEPHANIE/ROGA LI/ECO JOY/GLOSY/LULU/HAVEN). Always bills
-- one period ahead - a reminder firing in September is for October.
-- frequency='quarterly': ignores trigger_day, fires only on the last day
-- of Mar/Jun/Sep/Dec (MINTU), for the quarter about to start.
--
-- last_handled_period ('YYYY-MM' or 'YYYY-Q#') is stamped once this
-- period's charge has been created, or explicitly skipped - the guard that
-- stops the same period's reminder from reappearing once acted on.
create table if not exists public.mys_management_fee_templates (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  amount numeric not null default 0,
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly')),
  trigger_day integer check (trigger_day between 1 and 31),
  last_handled_period text,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boat_id)
);

drop trigger if exists set_updated_at on public.mys_management_fee_templates;
create trigger set_updated_at before update on public.mys_management_fee_templates
  for each row execute function public.set_updated_at();

alter table public.mys_management_fee_templates enable row level security;

drop policy if exists mys_management_fee_templates_all on public.mys_management_fee_templates;
create policy mys_management_fee_templates_all on public.mys_management_fee_templates
  for all using (public.is_management()) with check (public.is_management());

-- Traces a boat's own management-fee expense row back to the template that
-- produced it - nullable/additive, same back-link convention every other
-- auto-created MYS record already follows (recurring_template_id,
-- mys_invoice_id, etc.) on this same expenses table.
alter table public.expenses
  add column if not exists mys_management_fee_template_id uuid references public.mys_management_fee_templates (id) on delete set null;

-- Seeds one row per boat named in her request, amount 0 - she fills in the
-- real figures herself from the reminder popup's "permanent" edit choice
-- (never guessed here). Matched by exact boat name (all-caps in this
-- table); a name that doesn't exist in this fleet is silently skipped
-- rather than failing the whole migration.
insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day)
select b.id, 'monthly', null
from public.boats b
where b.name in ('STEPHANIE', 'ROGA LI', 'ECO JOY', 'GLOSY', 'LULU', 'HAVEN')
on conflict (boat_id) do nothing;

insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day)
select b.id, 'monthly', 10
from public.boats b
where b.name = 'MA BELLE'
on conflict (boat_id) do nothing;

insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day)
select b.id, 'quarterly', null
from public.boats b
where b.name = 'MINTU'
on conflict (boat_id) do nothing;
