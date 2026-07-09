import { createClient } from "@/lib/supabase/server";
import { getBusiness, getPendingTransactions } from "@/lib/data";
import { displayDate } from "@/lib/dates";
import { CloseClient } from "./CloseClient";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const supabase = createClient();
  const [{ data: locks }, pending] = await Promise.all([
    supabase
      .from("locks")
      .select("*")
      .eq("business_id", business.id)
      .order("period_end_date", { ascending: false }),
    getPendingTransactions(business.id),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Monthly Close</h1>
        <p className="text-sm text-ink-faint">
          Lock a period once it is reconciled. Locked entries become immutable — corrections are new
          dated entries, never edits. This is what makes the books audit-defensible.
        </p>
      </header>

      <section className="card">
        <h2 className="mb-3 font-semibold">Close checklist</h2>
        <ul className="space-y-2 text-sm">
          <Check done={pending.length === 0} label="Review queue is empty (all transactions categorized)" />
          <Check done label="Bank/Stripe balances reconciled to statements" note="Verify manually before locking" />
          <Check done label="P&L reviewed for the period" />
        </ul>
        {pending.length > 0 && (
          <p className="mt-3 text-sm text-ledger-amber">
            {pending.length} transaction{pending.length === 1 ? "" : "s"} still pending. Clear the
            queue before locking.
          </p>
        )}
      </section>

      <CloseClient businessId={business.id} canLock={pending.length === 0} />

      <section className="card">
        <h2 className="mb-3 font-semibold">Locked periods</h2>
        {!locks || locks.length === 0 ? (
          <p className="text-sm text-ink-faint">No periods locked yet.</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th>Period end</th>
                <th>Locked at</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {locks.map((l: any) => (
                <tr key={l.id}>
                  <td>{displayDate(l.period_end_date)}</td>
                  <td className="text-ink-faint">{new Date(l.locked_at).toLocaleString()}</td>
                  <td className="text-ink-faint">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Check({ done, label, note }: { done: boolean; label: string; note?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={done ? "text-ledger-green" : "text-ink-faint"}>{done ? "✓" : "○"}</span>
      <span>
        {label}
        {note && <span className="ml-1 text-xs text-ink-faint">({note})</span>}
      </span>
    </li>
  );
}
