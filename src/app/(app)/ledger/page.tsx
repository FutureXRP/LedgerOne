import Link from "next/link";
import { Money } from "@/components/Money";
import { getAccountBalances, getBusiness, getRegister } from "@/lib/data";
import { displayDate } from "@/lib/dates";
import type { AccountType } from "@/lib/types";
import { ManualJournal } from "./ManualJournal";
import { getAccounts } from "@/lib/data";

export const dynamic = "force-dynamic";

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export default async function LedgerPage() {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const [balances, register, accounts] = await Promise.all([
    getAccountBalances(business.id),
    getRegister(business.id),
    getAccounts(business.id),
  ]);

  const byType = new Map<AccountType, typeof balances>();
  for (const t of TYPE_ORDER) byType.set(t, []);
  for (const b of balances) byType.get(b.type)?.push(b);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
          <p className="text-sm text-ink-faint">Chart of accounts, balances, and the register.</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {TYPE_ORDER.map((t) => {
          const rows = byType.get(t) ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={t} className="card">
              <h2 className="mb-2 font-semibold">{TYPE_LABEL[t]}</h2>
              <table className="ledger">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.account_id}>
                      <td className="w-14 text-ink-faint">{r.code}</td>
                      <td>
                        <Link href={`/ledger/${r.account_id}`} className="hover:underline">
                          {r.name}
                          {r.is_contra && <span className="ml-1 text-xs text-ink-faint">(contra)</span>}
                        </Link>
                      </td>
                      <td className="num">
                        <Money cents={Number(r.natural_cents)} accounting />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <ManualJournal businessId={business.id} accounts={accounts} />

      <section className="card">
        <h2 className="mb-3 font-semibold">Recent register</h2>
        {register.length === 0 ? (
          <p className="text-sm text-ink-faint">No entries yet. Import or post a journal entry.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {register.map((e: any) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{displayDate(e.transactions.date)}</td>
                    <td className="max-w-xs truncate">{e.transactions.description}</td>
                    <td className="whitespace-nowrap text-ink-soft">
                      {e.accounts.code} {e.accounts.name}
                    </td>
                    <td className="num">
                      <Money cents={Number(e.amount_cents)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
