-- Issues need separate supplier/contractor fields for parts vs labour (e.g. a
-- parts supplier and a separate installer) - additive column only, the
-- existing `supplier` field keeps its data and becomes "parts supplier".
alter table public.issues
  add column if not exists supplier_labour text;
