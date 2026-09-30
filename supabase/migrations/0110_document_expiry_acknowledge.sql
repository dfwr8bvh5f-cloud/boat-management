-- Lets a document's upcoming expiry be acknowledged (already being handled,
-- no need to keep nagging) without deleting or otherwise touching the
-- document itself. Tied to the specific expiry_date acknowledged (not a
-- plain boolean) - editing the document with a new/renewed expiry_date
-- naturally makes it reappear as needing attention, no separate reset
-- logic needed: the fleet-wide "Expiring soon" query only ever suppresses
-- a row when expiry_ack_date still matches the document's current
-- expiry_date.
alter table public.documents
  add column if not exists expiry_ack_date date,
  add column if not exists expiry_acknowledged_at timestamptz;
