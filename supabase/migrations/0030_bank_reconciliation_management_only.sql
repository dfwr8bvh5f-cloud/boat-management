-- Bank statement reconciliation is management-only - captains and owners
-- should not see or touch it.

drop policy if exists bank_statement_lines_select on public.bank_statement_lines;
create policy bank_statement_lines_select on public.bank_statement_lines for select
  using (public.is_management());

drop policy if exists bank_statement_lines_insert on public.bank_statement_lines;
create policy bank_statement_lines_insert on public.bank_statement_lines for insert
  with check (public.is_management());

drop policy if exists bank_statement_lines_update on public.bank_statement_lines;
create policy bank_statement_lines_update on public.bank_statement_lines for update
  using (public.is_management());

drop policy if exists bank_statement_lines_delete on public.bank_statement_lines;
create policy bank_statement_lines_delete on public.bank_statement_lines for delete
  using (public.is_management());
