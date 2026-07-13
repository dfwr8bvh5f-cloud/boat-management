-- ============================================================================
-- Multiple ID/passport documents per staff member (e.g. front + back of an
-- ID card, or an ID plus a passport). Mirrors the boat_gallery_photos
-- pattern (0020_boat_gallery.sql): staff.id_document_path stays as-is for
-- any already-uploaded single document, this table holds every document
-- (including that legacy one going forward) so more than one can be added.
-- ============================================================================

create table if not exists public.staff_id_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_id_documents_staff_id_idx on public.staff_id_documents (staff_id);
create index if not exists staff_id_documents_boat_id_idx on public.staff_id_documents (boat_id);

alter table public.staff_id_documents enable row level security;

-- Mirrors the staff table's own select/write policies.
drop policy if exists staff_id_documents_select on public.staff_id_documents;
create policy staff_id_documents_select on public.staff_id_documents for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists staff_id_documents_write on public.staff_id_documents;
create policy staff_id_documents_write on public.staff_id_documents for all
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()))
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));
