-- Lets her reorder an invoice's line items when editing it, not only while
-- first building it (src/components/mys-invoices-manager.tsx's edit
-- panel). Nullable - a null sort_order sorts after every explicitly
-- ordered line, falling back to created_at (see the ordered read in
-- src/app/(app)/mys/invoices/[id]/page.tsx), so a line added through
-- another path that never sets this (e.g. mys-debts-manager.tsx's own
-- simpler line editor) just lands at the end instead of jumping to the
-- front.
alter table public.mys_invoice_lines add column if not exists sort_order integer;

-- Backfill: every existing line gets its current created_at order made
-- explicit, so nothing visibly reshuffles the first time this ships.
with ranked as (
  select id, row_number() over (partition by invoice_id order by created_at) - 1 as rn
  from public.mys_invoice_lines
)
update public.mys_invoice_lines l
set sort_order = ranked.rn
from ranked
where l.id = ranked.id and l.sort_order is null;
