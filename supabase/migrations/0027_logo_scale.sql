-- Lets management zoom a boat's logo in/out inside its frame, in addition
-- to the existing drag position control.
alter table public.boats
  add column if not exists logo_scale numeric not null default 100;
