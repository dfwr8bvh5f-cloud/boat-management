-- Re-asserts the management-fee reminder feature (0102) and adds HOFESH to
-- it. She confirmed she has never seen the reminder popup on /mys at all,
-- for any boat - every statement below is safe to re-run even if 0102 was
-- already applied, so this covers both "0102 was never run" and "0102 ran
-- fine, HOFESH just isn't in its boat list yet" without needing to know
-- which case this is.

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

alter table public.expenses
  add column if not exists mys_management_fee_template_id uuid references public.mys_management_fee_templates (id) on delete set null;

-- HOFESH's own row - amount 0 to start (she fills in the real monthly
-- figure from the reminder popup's "permanent" edit choice the first time
-- it appears, never guessed here). Monthly, last day of the month - the
-- same default most of the fleet already uses (only MA BELLE has a fixed
-- trigger_day of 10, and MINTU is quarterly).
insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day)
select b.id, 'monthly', null
from public.boats b
where b.name = 'HOFESH'
on conflict (boat_id) do nothing;
