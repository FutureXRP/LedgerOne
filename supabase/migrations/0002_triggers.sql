-- LedgerOne — Integrity triggers
--
-- These are the rules that make the books audit-defensible. They live in the
-- database so that no application bug, no manual SQL, and no future integration
-- can ever write books that don't balance or edit a locked period.

begin;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'businesses','accounts','transactions','ledger_entries',
    'categorization_rules','attachments','tax_config'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on %1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RULE 1: Zero-sum. Ledger entries for a transaction must sum to zero.
--
-- Enforced as a CONSTRAINT trigger deferred to commit time, so a transaction
-- can be assembled line by line within a db transaction and is only validated
-- once, at the end. Non-deleted entries only.
-- ---------------------------------------------------------------------------
create or replace function enforce_zero_sum() returns trigger as $$
declare
  affected uuid;
  total    bigint;
  live_cnt integer;
begin
  affected := coalesce(new.transaction_id, old.transaction_id);

  select coalesce(sum(amount_cents), 0), count(*)
    into total, live_cnt
    from ledger_entries
   where transaction_id = affected
     and deleted_at is null;

  -- A transaction with zero live entries is allowed (e.g. fully soft-deleted).
  if live_cnt = 0 then
    return null;
  end if;

  if total <> 0 then
    raise exception
      'Unbalanced transaction %: live ledger entries sum to % cents, must be 0',
      affected, total
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_entries_zero_sum on ledger_entries;
create constraint trigger trg_entries_zero_sum
  after insert or update or delete on ledger_entries
  deferrable initially deferred
  for each row execute function enforce_zero_sum();

-- ---------------------------------------------------------------------------
-- RULE 2: Period locking. No writes to entries dated on/before a locked
-- period. Corrections are new dated entries, never edits to old ones.
-- ---------------------------------------------------------------------------
create or replace function is_period_locked(p_business_id uuid, p_date date)
returns boolean as $$
  select exists (
    select 1 from locks
     where business_id = p_business_id
       and period_end_date >= p_date
  );
$$ language sql stable;

create or replace function guard_locked_entry() returns trigger as $$
declare
  txn_date date;
  txn_biz  uuid;
  target   uuid;
begin
  target := coalesce(new.transaction_id, old.transaction_id);
  select t.date, t.business_id into txn_date, txn_biz
    from transactions t where t.id = target;

  if txn_date is not null and is_period_locked(txn_biz, txn_date) then
    raise exception
      'Period containing % is locked. Post a new dated correcting entry instead of editing.',
      txn_date
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_entries_lock_guard on ledger_entries;
create trigger trg_entries_lock_guard
  before insert or update or delete on ledger_entries
  for each row execute function guard_locked_entry();

-- Also block moving a transaction's date into a locked period, or editing a
-- transaction that already sits in one.
create or replace function guard_locked_transaction() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if is_period_locked(old.business_id, old.date) then
      -- Allow only the status transition to 'locked' itself; block real edits.
      if new.date <> old.date
         or new.description <> old.description
         or new.business_id <> old.business_id then
        raise exception 'Transaction % is in a locked period and cannot be edited.', old.id
          using errcode = 'check_violation';
      end if;
    end if;
    if is_period_locked(new.business_id, new.date) and new.date <> old.date then
      raise exception 'Cannot move a transaction into locked period ending %.', new.date
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_txn_lock_guard on transactions;
create trigger trg_txn_lock_guard
  before update on transactions
  for each row execute function guard_locked_transaction();

commit;
