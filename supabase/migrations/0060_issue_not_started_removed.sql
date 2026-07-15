-- ============================================================================
-- Retires "not_started" as a selectable/produced issue status - new issues
-- now start directly at "pending", and the status-cycle button never
-- produces "not_started" again. Any existing issue still sitting at
-- "not_started" is moved to "pending" too, so nothing is left in a status
-- the app no longer shows as a filter/cycle option.
--
-- The enum value itself (public.issue_op_status) is left in place - Postgres
-- can't cheaply drop a single enum value (it would require recreating the
-- type), and leaving an unused value costs nothing.
-- ============================================================================

alter table public.issues alter column op_status set default 'pending';

update public.issues set op_status = 'pending' where op_status = 'not_started';
