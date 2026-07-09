-- Technical spec items need a serial number, model, and next-service date
-- alongside the existing free-text description - additive columns only,
-- existing rows simply have all three as null.
alter table public.technical_specs
  add column if not exists model text,
  add column if not exists serial_number text,
  add column if not exists next_service_date date;
