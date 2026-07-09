-- LedgerOne — Core schema
-- Personal accounting + tax platform for PassageLab, LLC.
--
-- Iron Rule (README Section 4): deterministic code handles money.
-- Ledger integrity lives HERE, in the database — constraints and triggers,
-- not app code. The database physically cannot hold an unbalanced entry.
--
-- All money is stored as signed integer CENTS in bigint columns. Never floats.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type account_type as enum ('asset','liability','equity','income','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entity_type as enum ('smllc','s_corp','c_corp','partnership','sole_prop');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tax_treatment as enum ('schedule_c','form_1120s','form_1065');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_source as enum ('csv','stripe','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_status as enum ('pending','categorized','reconciled','locked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_type as enum ('contains','regex','exact');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rule_origin as enum ('manual','ai_accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attachment_kind as enum ('receipt','statement','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  entity_type       entity_type not null default 'smllc',
  tax_treatment     tax_treatment not null default 'schedule_c',
  state             text not null default 'OK',
  fiscal_year_start date not null default '2026-01-01',
  formation_date    date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- accounts (chart of accounts)
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  code              text not null,
  name              text not null,
  type              account_type not null,
  subtype           text,
  -- Configurable form-line mapping. NEVER hardcoded in app logic (README Section 2).
  tax_line_mapping  text,
  is_contra         boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (business_id, code)
);

create index if not exists idx_accounts_business on accounts(business_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  date              date not null,
  description       text not null default '',
  source            txn_source not null default 'manual',
  source_ref        text,             -- bank ref / stripe id / import batch row
  external_amount_cents bigint,       -- raw signed amount from the source, for reconciliation
  status            txn_status not null default 'pending',
  ai_suggested_account_id uuid references accounts(id),
  ai_rationale      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_txn_business_date on transactions(business_id, date) where deleted_at is null;
create index if not exists idx_txn_status on transactions(business_id, status) where deleted_at is null;
-- Guard against importing the same source row twice.
create unique index if not exists uq_txn_source_ref
  on transactions(business_id, source, source_ref)
  where source_ref is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- ledger_entries (the double-entry lines)
-- ---------------------------------------------------------------------------
create table if not exists ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid not null references transactions(id),
  account_id        uuid not null references accounts(id),
  amount_cents      bigint not null,  -- signed. debits +, credits - (by convention below)
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_entries_txn on ledger_entries(transaction_id) where deleted_at is null;
create index if not exists idx_entries_account on ledger_entries(account_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- categorization_rules
-- ---------------------------------------------------------------------------
create table if not exists categorization_rules (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  match_type        match_type not null default 'contains',
  pattern           text not null,
  account_id        uuid not null references accounts(id),
  confidence        numeric(4,3) not null default 1.000,
  hit_count         integer not null default 0,
  created_from      rule_origin not null default 'manual',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_rules_business on categorization_rules(business_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
create table if not exists attachments (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid references transactions(id),
  business_id       uuid not null references businesses(id),
  storage_path      text not null,
  kind              attachment_kind not null default 'receipt',
  original_name     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- tax_config (per business, per year) — every tax-affecting flag lives here
-- ---------------------------------------------------------------------------
create table if not exists tax_config (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  year              integer not null,
  home_office_pct   numeric(5,2),          -- actual method %
  home_office_sqft  integer,               -- simplified method
  home_total_sqft   integer,
  vehicle_method    text,                  -- 'standard_mileage' | 'actual'
  business_miles    integer not null default 0,
  se_tax_applicable boolean not null default true,
  ok_apportionment  numeric(5,4) not null default 1.0000,
  prior_year_agi_cents  bigint,            -- for safe-harbor 110%/100%
  prior_year_tax_cents  bigint,            -- prior-year total tax, for safe-harbor
  filing_status     text not null default 'single',
  verified_by_cpa   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (business_id, year)
);

-- ---------------------------------------------------------------------------
-- tax_snapshots — point-in-time computed positions (from SQL views, not AI)
-- ---------------------------------------------------------------------------
create table if not exists tax_snapshots (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  as_of_date        date not null,
  ytd_income_cents  bigint not null,
  ytd_expense_cents bigint not null,
  net_profit_cents  bigint not null,
  est_se_tax_cents  bigint not null,
  est_federal_cents bigint not null,
  est_ok_cents      bigint not null,
  generated_by      text not null default 'sql_view',
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- locks — period locking. Entries on/before a locked period are immutable.
-- ---------------------------------------------------------------------------
create table if not exists locks (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id),
  period_end_date   date not null,
  locked_at         timestamptz not null default now(),
  note              text,
  unique (business_id, period_end_date)
);

commit;
