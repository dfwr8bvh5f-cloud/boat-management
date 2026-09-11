-- Lets an MYS expense's category/date be left unset ("not decided yet"),
-- same as the boat side already allows (0021_expense_draft_warranty.sql,
-- 0058_expense_category_optional.sql) - a category especially isn't always
-- obvious right when a receipt is logged, and a forced "other" default was
-- hiding real "needs a category" items inside a bucket also used for
-- genuine miscellaneous expenses.
alter table public.mys_expenses
  alter column category drop not null,
  alter column category drop default,
  alter column expense_date drop not null,
  alter column expense_date drop default;
