-- ============================================================================
-- MYS clients: contact/company details, editable in place.
--
-- mys_clients was a name-only pick list (0074_mys_clients_and_income_fields.sql).
-- It now also carries optional email/phone/free-text company details, and can
-- be edited (including renamed) from a dedicated /mys/clients screen -
-- updateMysClient (src/lib/actions/mys.ts) additionally propagates a rename
-- onto every existing mys_expenses/mys_income/mys_ad_hoc_charges/mys_invoices
-- row that used the old name, so historical records keep reading correctly
-- under the client's current name.
-- ============================================================================

alter table public.mys_clients add column if not exists email text;
alter table public.mys_clients add column if not exists phone text;
alter table public.mys_clients add column if not exists company_details text;
alter table public.mys_clients add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.mys_clients;
create trigger set_updated_at before update on public.mys_clients
  for each row execute function public.set_updated_at();
