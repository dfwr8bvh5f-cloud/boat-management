-- Performance audit follow-up (see reports/performance-audit-findings.md).
-- Purely additive - no columns renamed/dropped, no data touched, no RLS
-- policy changes. Every index below matches an actual query pattern
-- already in the codebase that only had a bare boat_id index to work with.

-- incomes/cash_transactions: same boat_id + date-sorted access pattern as
-- expenses (finance/bank and finance/cash pages, and computeBankBalance/
-- computeCashBalance in balances.ts), but expenses got this composite
-- index in migration 0038 and these two never did.
create index if not exists incomes_boat_active_date_idx
  on public.incomes (boat_id, income_date desc) where archived_at is null;

create index if not exists cash_transactions_boat_active_date_idx
  on public.cash_transactions (boat_id, tx_date desc) where archived_at is null;

-- bank_statement_lines: reconciliation filters/sorts by date and orders by
-- statement_order within a boat, but only a bare boat_id index existed.
create index if not exists bank_statement_lines_boat_date_idx
  on public.bank_statement_lines (boat_id, tx_date);

create index if not exists bank_statement_lines_boat_order_idx
  on public.bank_statement_lines (boat_id, statement_order);

-- documents.expiry_date: the fleet-wide "expiring soon" count on the
-- management dashboard (src/app/(app)/boats/page.tsx) and the daily
-- notification cron both filter on this column with no boat_id narrowing,
-- across every boat's documents at once.
create index if not exists documents_expiry_date_idx
  on public.documents (expiry_date) where expiry_date is not null;

-- issues.op_status: the fleet-wide "open issues" count (management
-- dashboard, /issues page, boat overview) filters "not in (completed,
-- cancelled)" across every boat's issues at once, with no supporting index.
create index if not exists issues_op_status_idx
  on public.issues (op_status);

-- bookings: the trip-turnover/notification cron jobs filter/sort by
-- start_date and end_date fleet-wide, with no supporting index.
create index if not exists bookings_start_date_idx on public.bookings (start_date);
create index if not exists bookings_end_date_idx on public.bookings (end_date);
