-- LedgerOne — Row Level Security
--
-- Single-tenant, personal use (README Section 1). There is exactly one human.
-- We still enable RLS so the anon key can't read the books: every table is
-- readable/writable only by an authenticated session. No per-row ownership
-- checks are needed because every authenticated session IS the owner.

begin;

do $$
declare t text;
begin
  foreach t in array array[
    'businesses','accounts','transactions','ledger_entries',
    'categorization_rules','attachments','tax_config','tax_snapshots','locks'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists p_%1$s_auth_all on %1$s;', t);
    execute format(
      'create policy p_%1$s_auth_all on %1$s
         for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

commit;
