-- ============================================================================
-- Bring `documents` in line with the same real approval workflow used by
-- expenses/issues/bookings/staff/incomes/cash_transactions: captain-authored
-- documents start pending, management-authored ones are auto-approved, and
-- owners only ever see approved documents (including the files themselves).
-- ============================================================================

alter table public.documents
  add column if not exists status public.approval_status not null default 'pending',
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz;

drop trigger if exists prevent_self_approval on public.documents;
create trigger prevent_self_approval before update on public.documents
  for each row execute function public.prevent_self_approval();

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (public.current_role() = 'owner' and boat_id = public.current_boat_id() and status = 'approved')
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- Storage read access must respect the same approval status, not just the
-- boat folder - otherwise an owner could open an unapproved document's file
-- directly even though the row itself is hidden from them.
drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      public.is_management()
      or exists (
        select 1 from public.documents d
        where d.file_path = storage.objects.name
          and d.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or d.status = 'approved')
      )
    )
  );
