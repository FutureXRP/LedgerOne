import Link from "next/link";
import { Money } from "@/components/Money";
import { getBusiness, getRegister, getAccounts } from "@/lib/data";
import { displayDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AccountRegisterPage({
  params,
}: {
  params: { accountId: string };
}) {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const [accounts, register] = await Promise.all([
    getAccounts(business.id),
    getRegister(business.id, params.accountId),
  ]);
  const account = accounts.find((a) => a.id === params.accountId);

  // Running balance oldest-first in the signed convention.
  const oldestFirst = [...register].reverse();
  let running = 0;
  const withRunning = oldestFirst.map((e: any) => {
    running += Number(e.amount_cents);
    return { ...e, running };
  });
  withRunning.reverse();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/ledger" className="text-sm text-ink-faint underline">
          ← Ledger
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {account ? `${account.code} ${account.name}` : "Account"}
        </h1>
        {account?.tax_line_mapping && (
          <p className="text-sm text-ink-faint">Maps to: {account.tax_line_mapping}</p>
        )}
      </header>

      <section className="card">
        {withRunning.length === 0 ? (
          <p className="text-sm text-ink-faint">No entries in this account yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Memo</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Running</th>
                </tr>
              </thead>
              <tbody>
                {withRunning.map((e: any) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{displayDate(e.transactions.date)}</td>
                    <td className="max-w-xs truncate">{e.transactions.description}</td>
                    <td className="text-ink-faint">{e.memo}</td>
                    <td className="num">
                      <Money cents={Number(e.amount_cents)} />
                    </td>
                    <td className="num text-ink-faint">
                      <Money cents={Number(e.running)} />
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
