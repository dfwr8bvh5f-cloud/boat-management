-- New execution status for technical issues / defects: "For owner approval"
-- (awaiting_owner_approval) - work that is waiting for the owner's go-ahead
-- (e.g. a quote). Shown in red in the app. ADDITIVE: one new enum value, no
-- row changes. Postgres only allows using a new enum value after this
-- statement has committed, so run it on its own (the Supabase SQL editor
-- does that).
alter type public.issue_op_status add value if not exists 'awaiting_owner_approval';
