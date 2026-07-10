-- Expenses need more than one receipt/photo attached (e.g. a multi-page
-- invoice split into several scans) - the existing single `receipt_path`/
-- `photo_path` columns on `expenses` stay as-is (old expenses keep
-- displaying from them, and a new expense still gets its first receipt/
-- photo written there too for backward compatibility with anything reading
-- those columns directly), new attachments beyond the first go into this
-- table instead, one row per file. Same shape as issue_attachments (0041).
create table if not exists public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'photo')),
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expense_attachments_expense_id_idx on public.expense_attachments (expense_id);

alter table public.expense_attachments enable row level security;

-- Same shape as the `expenses` table's own policies: management full
-- access, captain full access on their own boat, owner read-only on
-- approved expenses.
drop policy if exists expense_attachments_select on public.expense_attachments;
create policy expense_attachments_select on public.expense_attachments for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (
      public.current_role() = 'owner' and boat_id = public.current_boat_id()
      and exists (select 1 from public.expenses e where e.id = expense_attachments.expense_id and e.status = 'approved')
    )
  );

drop policy if exists expense_attachments_insert on public.expense_attachments;
create policy expense_attachments_insert on public.expense_attachments for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists expense_attachments_delete on public.expense_attachments;
create policy expense_attachments_delete on public.expense_attachments for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- Extend the existing receipts storage read policy (0002) to also allow
-- files referenced from the new table, not just the legacy single
-- receipt_path/photo_path columns.
drop policy if exists receipts_storage_select on storage.objects;
create policy receipts_storage_select on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      public.is_management()
      or exists (
        select 1 from public.expenses e
        where (e.receipt_path = storage.objects.name or e.photo_path = storage.objects.name)
          and e.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or e.status = 'approved')
      )
      or exists (
        select 1 from public.expense_attachments a
        join public.expenses e on e.id = a.expense_id
        where a.file_path = storage.objects.name
          and a.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or e.status = 'approved')
      )
    )
  );
