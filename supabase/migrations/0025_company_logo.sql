-- ============================================================================
-- Company (management) logo - a single fleet-wide logo, distinct from each
-- boat's own logo, shown alongside the boat logo on printed crew
-- lists/manifests. Singleton settings row + a small dedicated storage
-- bucket, uploadable by management only, readable by anyone signed in.
-- ============================================================================

create table if not exists public.app_settings (
  id boolean primary key default true,
  company_logo_path text,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select
  using (true);

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings for update
  using (public.is_management())
  with check (public.is_management());

insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', false)
on conflict (id) do nothing;

drop policy if exists company_assets_select on storage.objects;
create policy company_assets_select on storage.objects for select
  using (bucket_id = 'company-assets');

drop policy if exists company_assets_insert on storage.objects;
create policy company_assets_insert on storage.objects for insert
  with check (bucket_id = 'company-assets' and public.is_management());

drop policy if exists company_assets_update on storage.objects;
create policy company_assets_update on storage.objects for update
  using (bucket_id = 'company-assets' and public.is_management());

drop policy if exists company_assets_delete on storage.objects;
create policy company_assets_delete on storage.objects for delete
  using (bucket_id = 'company-assets' and public.is_management());
