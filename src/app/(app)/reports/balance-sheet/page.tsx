import { Money } from "@/components/Money";
import { getBalanceSheet, getBusiness } from "@/lib/data";
import { isoToday, displayDate } from "@/lib/dates";
import { sumCents } from "@/lib/money";
import type { BalanceSheetRow, AccountType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: { asOf?: string };
}) {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const asOf = searchParams.asOf ?? isoToday();
  const rows = await getBalanceSheet(business.id, asOf);

  const group = (t: AccountType) => rows.filter((r) => r.section === t);
  const assets = group("asset");
  const liabilities = group("liability");
  const equity = group("equity");

  const assetTotal = sumCents(assets.map((r) => Number(r.amount_cents)));
  const liabTotal = sumCents(liabilities.map((r) => Number(r.amount_cents)));
  const equityTotal = sumCents(equity.map((r) => Number(r.amount_cents)));

  // Net income (retained earnings not yet closed) makes the sheet balance:
  // Assets = Liabilities + Equity + (Income - Expense to date).
  const impliedEquity = assetTotal - liabTotal;
  const currentEarnings = impliedEquity - equityTotal;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Balance Sheet</h1>
        <p className="text-sm text-ink-faint">As of {displayDate(asOf)}</p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <Block title="Assets" rows={assets} total={assetTotal} />
        </div>
        <div className="card space-y-4">
          <Block title="Liabilities" rows={liabilities} total={liabTotal} />
          <div className="border-t border-line pt-4">
            <Block title="Equity" rows={equity} total={equityTotal} />
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-ink-soft">Current-period earnings</span>
              <Money cents={currentEarnings} />
            </div>
          </div>
          <div className="flex items-center justify-between border-t-2 border-ink pt-3 font-bold">
            <span>Liabilities + Equity</span>
            <Money cents={liabTotal + equityTotal + currentEarnings} />
          </div>
        </div>
      </section>

      <p className="text-xs text-ink-faint">
        Assets ({<span className="num">{money(assetTotal)}</span>}) must equal Liabilities + Equity
        ({<span className="num">{money(liabTotal + equityTotal + currentEarnings)}</span>}). If they
        diverge, a transaction is unbalanced — which the database should make impossible.
      </p>
    </div>
  );
}

function Block({ title, rows, total }: { title: string; rows: BalanceSheetRow[]; total: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Money cents={total} className="font-semibold" />
      </div>
      <table className="ledger">
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="text-ink-faint" colSpan={2}>
                None.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.account_id}>
              <td className="w-14 text-ink-faint">{r.code}</td>
              <td>{r.name}</td>
              <td className="num">
                <Money cents={Number(r.amount_cents)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function money(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
