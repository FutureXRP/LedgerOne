import { getAccounts, getBusiness } from "@/lib/data";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;
  const accounts = await getAccounts(business.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-sm text-ink-faint">
          Upload a bank or credit-card export. Rows are staged as pending transactions and sent to
          the review queue. Duplicate rows (same date/description/amount) are skipped automatically.
        </p>
      </header>
      <ImportClient business={business} accounts={accounts} />
    </div>
  );
}
