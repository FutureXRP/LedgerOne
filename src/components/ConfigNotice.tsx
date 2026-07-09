export function ConfigNotice() {
  return (
    <div className="mb-6 rounded-lg border border-ledger-amber/40 bg-amber-50 p-4 text-sm text-ledger-amber">
      <div className="font-semibold">Supabase is not configured yet.</div>
      <p className="mt-1">
        Copy <code className="rounded bg-white px-1">.env.example</code> to{" "}
        <code className="rounded bg-white px-1">.env.local</code>, set your Supabase URL and keys,
        then run the migrations in <code className="rounded bg-white px-1">supabase/migrations</code>.
        The UI renders without data until then.
      </p>
    </div>
  );
}
