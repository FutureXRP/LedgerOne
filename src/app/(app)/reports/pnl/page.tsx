import { Money } from "@/components/Money";
import { getBusiness, getPnl } from "@/lib/data";
import { ytdRange, currentYear, displayDate, yearRange, quarterRange } from "@/lib/dates";
import { sumCents } from "@/lib/money";
import { PeriodPicker } from "@/components/PeriodPicker";
import type { PnlRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; preset?: string };
}) {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const { from, to, label } = resolveRange(searchParams);
  const rows = await getPnl(business.id, from, to);

  const income = rows.filter((r) => r.section === "income");
  const expense = rows.filter((r) => r.section === "expense");
  const incomeTotal = sumCents(income.map((r) => Number(r.amount_cents)));
  const expenseTotal = sumCents(expense.map((r) => Number(r.amount_cents)));
  const net = incomeTotal - expenseTotal;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit &amp; Loss</h1>
          <p className="text-sm text-ink-faint">
            {label} · {displayDate(from)} – {displayDate(to)}
          </p>
        </div>
        <PeriodPicker basePath="/reports/pnl" />
      </header>

      <section className="card">
        <Section title="Income" rows={income} total={incomeTotal} />
        <div className="my-4 border-t border-line" />
        <Section title="Expenses" rows={expense} total={expenseTotal} />
        <div className="mt-4 flex items-center justify-between border-t-2 border-ink pt-3">
          <span className="text-base font-bold">Net Profit</span>
          <Money cents={net} accounting className="text-base font-bold" />
        </div>
      </section>
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: PnlRow[]; total: number }) {
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
                No activity.
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

function resolveRange(sp: { from?: string; to?: string; preset?: string }) {
  const year = currentYear();
  if (sp.from && sp.to) return { from: sp.from, to: sp.to, label: "Custom range" };
  switch (sp.preset) {
    case "year":
      return { ...yearRange(year), label: `${year}` };
    case "q1":
      return { ...quarterRange(year, 1), label: `Q1 ${year}` };
    case "q2":
      return { ...quarterRange(year, 2), label: `Q2 ${year}` };
    case "q3":
      return { ...quarterRange(year, 3), label: `Q3 ${year}` };
    case "q4":
      return { ...quarterRange(year, 4), label: `Q4 ${year}` };
    default:
      return { ...ytdRange(), label: "Year to date" };
  }
}
