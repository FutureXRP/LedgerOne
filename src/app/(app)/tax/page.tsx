import Link from "next/link";
import { Money } from "@/components/Money";
import {
  getBusiness,
  getNetProfitCents,
  getScheduleCRollup,
  getTaxConfig,
} from "@/lib/data";
import { computeTaxPosition, computeQuarterlyEstimates } from "@/lib/tax/calc";
import { yearRange, currentYear, displayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function TaxPage({ searchParams }: { searchParams: { year?: string } }) {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const year = Number(searchParams.year) || currentYear();
  const { from, to } = yearRange(year);

  const [{ incomeCents, expenseCents, netCents }, rollup, taxConfig] = await Promise.all([
    getNetProfitCents(business.id, from, to),
    getScheduleCRollup(business.id, from, to),
    getTaxConfig(business.id, year),
  ]);

  const position = computeTaxPosition(Math.max(0, netCents), year);
  const quarterly = computeQuarterlyEstimates(position, {
    priorYearTaxCents: taxConfig?.prior_year_tax_cents ?? null,
    priorYearAgiCents: taxConfig?.prior_year_agi_cents ?? null,
  });

  const incomeLines = rollup.filter((r) => r.section === "income");
  const expenseLines = rollup.filter((r) => r.section === "expense");
  const cpaVerified = taxConfig?.verified_by_cpa ?? false;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax — {year}</h1>
          <p className="text-sm text-ink-faint">
            Schedule C treatment · {business.state}. Estimates only, not tax advice.
          </p>
        </div>
        <Link href="/tax/package" className="btn-primary">
          Year-end package
        </Link>
      </header>

      {!cpaVerified && (
        <div className="rounded-lg border border-ledger-amber/40 bg-amber-50 p-4 text-sm text-ledger-amber">
          Tax configuration is <strong>not CPA-verified</strong>. Figures below are for planning.
        </div>
      )}

      {/* Schedule C rollup */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Schedule C mapping (live)</h2>
        <table className="ledger">
          <thead>
            <tr>
              <th>Form line</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">Income</td>
              <td className="num font-semibold">
                <Money cents={incomeCents} />
              </td>
            </tr>
            {incomeLines.map((r) => (
              <tr key={`i-${r.tax_line}`}>
                <td className="pl-6 text-ink-soft">{r.tax_line}</td>
                <td className="num">
                  <Money cents={Number(r.amount_cents)} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 font-semibold">Expenses</td>
              <td className="num pt-3 font-semibold">
                <Money cents={expenseCents} />
              </td>
            </tr>
            {expenseLines.map((r) => (
              <tr key={`e-${r.tax_line}`}>
                <td className="pl-6 text-ink-soft">{r.tax_line}</td>
                <td className="num">
                  <Money cents={Number(r.amount_cents)} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="font-bold">Net profit (Schedule C line 31)</td>
              <td className="num font-bold">
                <Money cents={netCents} accounting />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* SE tax */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Self-employment tax</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Net profit" cents={position.netProfitCents} />
          <Row label="× 92.35% = net earnings from SE" cents={position.se.netEarningsCents} />
          <Row label="Social Security portion (12.4%, capped)" cents={position.se.socialSecurityCents} />
          <Row label="Medicare portion (2.9%)" cents={position.se.medicareCents} />
          {position.se.additionalMedicareCents > 0 && (
            <Row label="Additional Medicare (0.9%)" cents={position.se.additionalMedicareCents} />
          )}
          <div className="border-t border-line pt-2">
            <Row label="Total SE tax" cents={position.se.totalSeTaxCents} bold />
          </div>
          <Row label="Deductible half (adjusts income tax)" cents={position.se.halfDeductibleCents} muted />
        </dl>
      </section>

      {/* Income tax estimate */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Federal income tax (est.)</h2>
          <dl className="space-y-2 text-sm">
            <Row label="QBI deduction (est.)" cents={position.qbiDeductionCents} muted />
            <Row label="Federal taxable income" cents={position.federalTaxableCents} />
            <Row label="Federal income tax" cents={position.federalIncomeTaxCents} bold />
            <div className="border-t border-line pt-2">
              <Row label="+ SE tax" cents={position.se.totalSeTaxCents} muted />
              <Row label="Total federal" cents={position.totalFederalCents} bold />
            </div>
          </dl>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Oklahoma income tax (est.)</h2>
          <dl className="space-y-2 text-sm">
            <Row label="OK taxable income" cents={position.okTaxableCents} />
            <Row label="OK income tax" cents={position.okIncomeTaxCents} bold />
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            SMLLC income flows to the OK Form 511 personal return. No separate entity-level OK income
            tax for a disregarded SMLLC.
          </p>
        </div>
      </section>

      {/* Quarterly estimates */}
      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Quarterly estimated payments</h2>
          <span className="text-xs text-ink-faint">
            Federal basis: {quarterly.safeHarborNoteFederal}
          </span>
        </div>
        <table className="ledger">
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Due</th>
              <th className="text-right">Federal (1040-ES)</th>
              <th className="text-right">Oklahoma (OW-8-ES)</th>
            </tr>
          </thead>
          <tbody>
            {quarterly.perQuarter.map((q) => (
              <tr key={q.quarter}>
                <td>Q{q.quarter}</td>
                <td className={dueSoon(q.due) ? "text-ledger-amber" : ""}>{displayDate(q.due)}</td>
                <td className="num">{formatCents(q.federalCents)}</td>
                <td className="num">{formatCents(q.okCents)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-bold">
              <td colSpan={2}>Annual target</td>
              <td className="num">{formatCents(quarterly.annualFederalCents)}</td>
              <td className="num">{formatCents(quarterly.annualOkCents)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Assumptions */}
      <section className="card">
        <h2 className="mb-2 font-semibold">Assumptions behind these numbers</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {position.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({
  label,
  cents,
  bold = false,
  muted = false,
}: {
  label: string;
  cents: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-semibold" : muted ? "text-ink-faint" : "text-ink-soft"}>{label}</dt>
      <dd className={bold ? "font-semibold" : muted ? "text-ink-faint" : ""}>
        <Money cents={cents} />
      </dd>
    </div>
  );
}

function dueSoon(iso: string): boolean {
  const due = new Date(iso + "T00:00:00Z").getTime();
  const now = Date.now();
  const days = (due - now) / 86_400_000;
  return days >= 0 && days <= 30;
}
