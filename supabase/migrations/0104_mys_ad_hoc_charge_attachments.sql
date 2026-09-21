-- ============================================================================
-- The invoice(s) she issued the client for an ad-hoc (non-fleet-boat) debt
-- charge on /mys/debts - same one-to-many shape as
-- mys_supplier_commission_attachments (0091_mys_supplier_commissions.sql),
-- since more than one file can belong to the same charge.
-- ============================================================================

create table if not exists public.mys_ad_hoc_charge_attachments (
  id uuid primary key default gen_random_uuid(),
  ad_hoc_charge_id uuid not null references public.mys_ad_hoc_charges (id) on delete cascade,
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_ad_hoc_charge_attachments_charge_id_idx
  on public.mys_ad_hoc_charge_attachments (ad_hoc_charge_id);

alter table public.mys_ad_hoc_charge_attachments enable row level security;

drop policy if exists mys_ad_hoc_charge_attachments_all on public.mys_ad_hoc_charge_attachments;
create policy mys_ad_hoc_charge_attachments_all on public.mys_ad_hoc_charge_attachments
  for all using (public.is_management()) with check (public.is_management());
