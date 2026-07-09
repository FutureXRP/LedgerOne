import { getAccounts, getBusiness, getPendingTransactions } from "@/lib/data";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const [accounts, pending] = await Promise.all([
    getAccounts(business.id),
    getPendingTransactions(business.id),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-sm text-ink-faint">
          {pending.length} pending. Accept the suggestion, recategorize, split, or skip. Keyboard:
          <kbd className="mx-1 rounded border border-line px-1">A</kbd>accept
          <kbd className="mx-1 rounded border border-line px-1">S</kbd>skip
          <kbd className="mx-1 rounded border border-line px-1">R</kbd>make rule.
        </p>
      </header>
      <ReviewClient business={business} accounts={accounts} pending={pending} />
    </div>
  );
}
