-- ============================================================================
-- Structured "future income" charter entries with a full commission/VAT
-- breakdown (charter code, ports, gross/net price) - see the future-income
-- panel redesign. Purely additive: new nullable columns on incomes, one new
-- column on boats with a safe default. No existing data/columns touched.
-- ============================================================================

-- Per-boat VAT rate on the charter's gross fee - unlike the fixed 15%
-- agent / 5% our-commission / 24% VAT-on-our-commission rates (which are
-- the same everywhere and live as constants in application code), this one
-- genuinely varies by boat, so it has to be data, not a code constant.
alter table public.boats add column if not exists charter_vat_rate numeric not null default 0.065;

update public.boats set charter_vat_rate = 0.065 where lower(trim(name)) = 'stephanie';
update public.boats set charter_vat_rate = 0.12  where lower(trim(name)) = 'lulu';
update public.boats set charter_vat_rate = 0.065 where lower(trim(name)) = 'samara';

-- Charter-contract details on a future-income row. All nullable: a plain
-- manual "actual" income (or any future-income row created before this
-- feature existed) simply has none of these set, and every existing code
-- path that only reads source/amount/income_date keeps working unchanged.
-- income_date (existing) doubles as the charter's start date; amount
-- (existing) becomes the computed net price to owner, so every existing
-- balance/report calculation that already sums incomes.amount picks this
-- up automatically.
alter table public.incomes add column if not exists charter_code text;
alter table public.incomes add column if not exists embarkation_port text;
alter table public.incomes add column if not exists disembarkation_port text;
alter table public.incomes add column if not exists charter_end_date date;
alter table public.incomes add column if not exists gross_price numeric;
alter table public.incomes add column if not exists delivery_fee numeric;
alter table public.incomes add column if not exists redelivery_fee numeric;
alter table public.incomes add column if not exists apa numeric;
alter table public.incomes add column if not exists contract_document_id uuid references public.documents(id) on delete set null;
