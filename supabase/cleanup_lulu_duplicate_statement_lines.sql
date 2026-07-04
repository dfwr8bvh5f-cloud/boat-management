-- One-time cleanup for boat Lulu: removes duplicate bank_statement_lines
-- rows created by repeated re-scans/re-imports of the same statement
-- (same date + amount + description imported more than once). For each
-- duplicate group, keeps the row that's already linked to a real
-- expense/income/cash record (if any), otherwise the earliest one, and
-- deletes the rest. Safe to run - linked records only have their
-- bank_statement_line_id set to null if their specific line gets removed
-- (on delete set null), they are never deleted themselves. Run once in
-- the Supabase SQL editor.
with matched as (
  select bank_statement_line_id as id from public.expenses where bank_statement_line_id is not null
  union
  select bank_statement_line_id from public.cash_transactions where bank_statement_line_id is not null
  union
  select bank_statement_line_id from public.incomes where bank_statement_line_id is not null
),
ranked as (
  select
    bsl.id,
    row_number() over (
      partition by bsl.boat_id, bsl.tx_date, bsl.amount, bsl.description
      order by (bsl.id in (select id from matched)) desc, bsl.created_at asc
    ) as rn
  from public.bank_statement_lines bsl
  where bsl.boat_id = (select id from public.boats where lower(name) in ('לולו', 'lulu') limit 1)
)
delete from public.bank_statement_lines
where id in (select id from ranked where rn > 1);
