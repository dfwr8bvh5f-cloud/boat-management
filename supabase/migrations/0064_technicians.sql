-- Fleet-wide technician/supplier directory (not tied to a single boat) -
-- management maintains the list; anyone who can report an issue can pick a
-- name from it for the Labour supplier / Parts supplier fields.
create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact text,
  phone text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists technicians_name_idx on public.technicians (lower(name));

alter table public.technicians enable row level security;

-- Everyone with an account can read the directory (needed to pick a
-- technician while filing an issue on any boat) - only management edits it.
drop policy if exists technicians_select on public.technicians;
create policy technicians_select on public.technicians for select
  using (auth.uid() is not null);

drop policy if exists technicians_write on public.technicians;
create policy technicians_write on public.technicians for all
  using (public.is_management())
  with check (public.is_management());
