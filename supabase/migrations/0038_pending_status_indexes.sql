-- The approvals page and the "pending" badges on the dashboard/boat/fleet
-- pages filter these seven tables by status = 'pending' on every load, but
-- the only existing index on any of them is a plain boat_id index - so this
-- filter forces a full scan of each table's rows every time. A partial
-- index (only indexing the pending rows, which are always a small minority)
-- is small to maintain and directly matches the actual query pattern.
create index if not exists expenses_status_pending_idx on public.expenses (boat_id) where status = 'pending';
create index if not exists incomes_status_pending_idx on public.incomes (boat_id) where status = 'pending';
create index if not exists cash_transactions_status_pending_idx on public.cash_transactions (boat_id) where status = 'pending';
create index if not exists bookings_status_pending_idx on public.bookings (boat_id) where status = 'pending';
create index if not exists staff_status_pending_idx on public.staff (boat_id) where status = 'pending';
create index if not exists documents_status_pending_idx on public.documents (boat_id) where status = 'pending';
create index if not exists issues_status_pending_idx on public.issues (boat_id) where status = 'pending';

-- Every expenses list/report page filters boat_id + archived_at is null and
-- orders by expense_date - this is the single most-queried pattern in the
-- app (expenses page, bank reconciliation, financial reports, boat
-- overview), and only a plain boat_id index existed to cover it.
create index if not exists expenses_boat_active_date_idx
  on public.expenses (boat_id, expense_date desc) where archived_at is null;

