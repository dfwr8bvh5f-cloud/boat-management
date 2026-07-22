-- ============================================================================
-- push_subscriptions is missing an UPDATE policy. savePushSubscription()
-- upserts on conflict(endpoint) - the insert-with-check policy only covers
-- a brand new row; re-subscribing with an endpoint that already exists
-- (re-enabling on the same device after a previous subscription row wasn't
-- cleanly removed, or two different accounts sharing one browser/device)
-- takes the UPDATE path, which RLS silently denies with no policy present.
-- That failure was invisible: the browser-level permission/subscription
-- had already succeeded by the time this call runs, so nothing in the UI
-- indicated anything had gone wrong - the toggle just never actually
-- switched on server-side.
-- ============================================================================

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
