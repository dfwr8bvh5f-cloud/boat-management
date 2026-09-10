-- Replaces the plain "invoice issued" checkbox on MYS Income with an actual
-- uploaded invoice document - she wants to attach the real file, not just
-- tick a box. invoice_issued (existing boolean) is kept for backward
-- compatibility with rows already marked issued before this change, but is
-- now derived server-side from whether invoice_path is set (see
-- createMysIncome/updateMysIncome, src/lib/actions/mys.ts) rather than a
-- manually-checked box.
alter table public.mys_income
  add column if not exists invoice_path text null;
