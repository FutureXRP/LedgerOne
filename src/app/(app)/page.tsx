import Link from "next/link";
import { Money } from "@/components/Money";
import { getBusiness, getNetProfitCents, getPendingTransactions, getTaxConfig } from "@/lib/data";
import { computeTaxPosition } from "@/lib/tax/calc";
import { ytdRange, currentYear, isoToday, displayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const business = await getBusiness();
  if (!business) {
    return <EmptyState />;
  }

  const year = currentYear();
  const { from, to } = ytdRange();
  const [{ incomeCents, expenseCents, netCents }, pending, taxConfig] = await Promise.all([
    getNetProfitCents(business.id, from, to),
    getPendingTransactions(business.id),
    getTaxConfig(business.id, year),
  ]);

  const position = computeTaxPosition(Math.max(0, netCents), year);
  const cpaVerified = taxConfig?.verified_by_cpa ?? false;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-faint">
            Year to date · {displayDate(from)} – {displayDate(to)}
          </p>
        </div>
        <Link href="/import" className="btn-primary">
          Import transactions
        </Link>
      </header>

      {!cpaVerified && (
        <div className="rounded-lg border border-ledger-amber/40 bg-amber-50 p-4 text-sm text-ledger-amber">
          Tax configuration for {year} is <strong>not yet CPA-verified</strong>. All tax figures
          below are estimates for planning only.{" "}
          <Link href="/settings" className="underline">
            Review settings
          </Link>
          .
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="YTD Income" cents={incomeCents} tone="green" />
        <Stat label="YTD Expenses" cents={expenseCents} tone="red" />
        <Stat label="Net Profit" cents={netCents} tone={netCents >= 0 ? "green" : "red"} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Estimated tax position</h2>
            <Link href="/tax" className="text-sm text-ink-faint underline">
              Details
            </Link>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Line label="Self-employment tax" cents={position.se.totalSeTaxCents} />
            <Line label="Federal income tax (est.)" cents={position.federalIncomeTaxCents} />
            <Line label="Oklahoma income tax (est.)" cents={position.okIncomeTaxCents} />
            <div className="border-t border-line pt-2">
              <Line label="Total estimated tax" cents={position.grandTotalCents} bold />
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            Effective rate on net profit:{" "}
            {netCents > 0 ? ((position.grandTotalCents / netCents) * 100).toFixed(1) : "0.0"}%
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Review queue</h2>
            <Link href="/transactions" className="text-sm text-ink-faint underline">
              Open
            </Link>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold">{pending.length}</span>
            <span className="text-sm text-ink-faint">transactions awaiting categorization</span>
          </div>
          {pending.length > 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Next up: {pending[0].description || "(no description)"} on{" "}
              {displayDate(pending[0].date)} ·{" "}
              {formatCents(Number(pending[0].external_amount_cents ?? 0))}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ledger-green">All caught up. Books are clean.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone: "green" | "red" }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${tone === "red" ? "text-ledger-red" : "text-ledger-green"}`}>
        {formatCents(cents)}
      </div>
    </div>
  );
}

function Line({ label, cents, bold = false }: { label: string; cents: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-semibold" : "text-ink-soft"}>{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>
        <Money cents={cents} />
      </dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card">
      <h1 className="text-xl font-bold">Welcome to LedgerOne</h1>
      <p className="mt-2 text-sm text-ink-soft">
        No business found. Run the migrations in{" "}
        <code className="rounded bg-paper px-1">supabase/migrations</code> to seed PassageLab, LLC
        and its chart of accounts.
      </p>
    </div>
  );
}
