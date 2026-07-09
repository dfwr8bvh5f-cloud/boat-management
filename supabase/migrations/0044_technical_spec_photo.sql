-- Technical spec items can have a plain reference photo (nameplate, the
-- item itself, etc.) - a single attachment, no AI scanning involved.
alter table public.technical_specs
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public)
values ('technical-spec-photos', 'technical-spec-photos', false)
on conflict (id) do nothing;

drop policy if exists technical_spec_photos_storage_select on storage.objects;
create policy technical_spec_photos_storage_select on storage.objects for select
  using (
    bucket_id = 'technical-spec-photos'
    and (
      public.is_management()
      or exists (
        select 1 from public.technical_specs s
        where s.photo_path = storage.objects.name
          and s.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or s.status = 'approved')
      )
    )
  );

drop policy if exists technical_spec_photos_storage_insert on storage.objects;
create policy technical_spec_photos_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'technical-spec-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists technical_spec_photos_storage_delete on storage.objects;
create policy technical_spec_photos_storage_delete on storage.objects for delete
  using (
    bucket_id = 'technical-spec-photos'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
