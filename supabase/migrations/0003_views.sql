-- LedgerOne — Reporting views
--
-- Every dollar figure in every report must be traceable to ledger rows via SQL
-- (README Section 4). These views ARE that traceability. The app reads numbers
-- from here; it never sums money in JavaScript.
--
-- Sign convention:
--   ledger_entries.amount_cents is signed. For the natural balance of an
--   account we normalize by type so reports read positive:
--     income   -> credit-normal  -> report as -sum(amount)
--     expense  -> debit-normal   -> report as  sum(amount)
--     asset    -> debit-normal   -> report as  sum(amount)
--     liability-> credit-normal  -> report as -sum(amount)
--     equity   -> credit-normal  -> report as -sum(amount)

begin;

-- Raw signed balance per account (all time), non-deleted only.
create or replace view v_account_balances as
select
  a.id            as account_id,
  a.business_id,
  a.code,
  a.name,
  a.type,
  a.subtype,
  a.tax_line_mapping,
  a.is_contra,
  -- Only count an entry when its transaction survived the join (not soft-deleted).
  -- Without the case, a left-joined entry with a NULL transaction would still sum.
  coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)::bigint as signed_cents,
  -- normalized so the account's natural balance is positive
  case a.type
    when 'income'    then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
    when 'liability' then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
    when 'equity'    then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
    else                   coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
  end::bigint as natural_cents
from accounts a
left join ledger_entries le
  on le.account_id = a.id and le.deleted_at is null
left join transactions t
  on t.id = le.transaction_id and t.deleted_at is null
where a.deleted_at is null
group by a.id;

-- Account balances constrained to a date range (for period P&L).
-- Implemented as a function because views can't take parameters.
create or replace function account_activity(
  p_business_id uuid, p_from date, p_to date
) returns table (
  account_id uuid, code text, name text, type account_type,
  tax_line_mapping text, is_contra boolean, natural_cents bigint
) as $$
  select
    a.id, a.code, a.name, a.type, a.tax_line_mapping, a.is_contra,
    -- Only entries whose transaction is in range AND not soft-deleted count.
    -- The transaction join carries the date filter; entries whose txn falls
    -- outside the range survive the LEFT JOIN with t.id NULL and must sum to 0.
    case a.type
      when 'income'    then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
      when 'liability' then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
      when 'equity'    then -coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
      else                   coalesce(sum(case when t.id is not null then le.amount_cents else 0 end), 0)
    end::bigint
  from accounts a
  left join ledger_entries le
    on le.account_id = a.id and le.deleted_at is null
  left join transactions t
    on t.id = le.transaction_id and t.deleted_at is null
   and t.date >= p_from and t.date <= p_to
  where a.deleted_at is null
    and a.business_id = p_business_id
  group by a.id;
$$ language sql stable;

-- Profit & Loss for a date range.
create or replace function pnl(
  p_business_id uuid, p_from date, p_to date
) returns table (
  section text, account_id uuid, code text, name text,
  tax_line_mapping text, amount_cents bigint
) as $$
  select
    case when type = 'income' then 'income' else 'expense' end as section,
    account_id, code, name, tax_line_mapping, natural_cents
  from account_activity(p_business_id, p_from, p_to)
  where type in ('income','expense')
    and natural_cents <> 0
  order by code;
$$ language sql stable;

-- Balance sheet as of a date (cumulative through p_as_of).
create or replace function balance_sheet(
  p_business_id uuid, p_as_of date
) returns table (
  section text, account_id uuid, code text, name text, amount_cents bigint
) as $$
  select type::text, account_id, code, name, natural_cents
  from account_activity(p_business_id, 'epoch'::date, p_as_of)
  where type in ('asset','liability','equity')
    and natural_cents <> 0
  order by type, code;
$$ language sql stable;

-- Schedule C rollup: each configured tax line's amount, live all year.
-- Income lines carry section='income' (gross receipts), expense lines
-- section='expense'. The app computes net profit as income - expense.
create or replace function schedule_c_rollup(
  p_business_id uuid, p_from date, p_to date
) returns table (
  section text, tax_line text, amount_cents bigint
) as $$
  select
    case when type = 'income' then 'income' else 'expense' end as section,
    coalesce(tax_line_mapping, 'Unmapped') as tax_line,
    sum(natural_cents)::bigint
  from account_activity(p_business_id, p_from, p_to)
  where type in ('income','expense') and natural_cents <> 0
  group by 1, 2
  order by 1 desc, 2;
$$ language sql stable;

commit;
