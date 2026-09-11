-- Free-text field for the billing/company details of whoever an mys_invoices
-- row is being issued to (name/address/tax id/whatever's relevant per
-- client, typed as she needs it - not fixed structured columns, per her own
-- request) so it can appear on the generated invoice document
-- (src/app/(app)/mys/invoices/[id]/page.tsx) alongside client_name/client_email.
alter table public.mys_invoices
  add column if not exists client_company_details text null;
