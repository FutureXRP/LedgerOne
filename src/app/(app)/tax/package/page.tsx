import { Money } from "@/components/Money";
import { PrintButton } from "@/components/PrintButton";
import {
  getBusiness,
  getNetProfitCents,
  getScheduleCRollup,
  getTaxConfig,
} from "@/lib/data";
import { computeTaxPosition } from "@/lib/tax/calc";
import { yearRange, currentYear, displayDate, isoToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

// The "hand this folder to your CPA" package. Print to PDF (Cmd/Ctrl-P).
// Every number here is reproducible from the ledger via the SQL views.
export default async function PackagePage({ searchParams }: { searchParams: { year?: string } }) {
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
  const expenseLines = rollup.filter((r) => r.section === "expense");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">Year-End Tax Package</h1>
        <div className="flex gap-2">
          <a href={`/api/export/gl?year=${year}`} className="btn-ghost">
            Download GL (CSV)
          </a>
          <PrintButton />
        </div>
      </div>

      <article className="space-y-8 rounded-lg border border-line bg-white p-8 print:border-0 print:p-0">
        {/* Cover sheet */}
        <header className="border-b border-line pb-6">
          <h2 className="text-xl font-bold">{business.name}</h2>
          <p className="text-sm text-ink-soft">
            {year} Tax Preparation Package · Federal Schedule C + Oklahoma Form 511
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Generated {displayDate(isoToday())} · Entity: {business.entity_type.toUpperCase()} ·
            State: {business.state} · Accounting method: cash
          </p>
          {!taxConfig?.verified_by_cpa && (
            <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-ledger-amber">
              Tax configuration not yet CPA-verified. Confirm home office method, vehicle method, and
              S-corp election status before filing.
            </p>
          )}
        </header>

        {/* Schedule C worksheet */}
        <section>
          <h3 className="mb-3 font-bold">Schedule C Worksheet</h3>
          <table className="ledger">
            <tbody>
              <RowLine label="Line 1 — Gross receipts" cents={incomeCents} />
              <RowLine label="Line 28 — Total expenses" cents={expenseCents} />
              {expenseLines.map((r) => (
                <tr key={r.tax_line}>
                  <td className="pl-6 text-ink-soft">{r.tax_line}</td>
                  <td className="num">
                    <Money cents={Number(r.amount_cents)} />
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-bold">
                <td>Line 31 — Net profit</td>
                <td className="num">
                  <Money cents={netCents} accounting />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* SE tax worksheet */}
        <section>
          <h3 className="mb-3 font-bold">Schedule SE Worksheet</h3>
          <table className="ledger">
            <tbody>
              <RowLine label="Net profit × 92.35%" cents={position.se.netEarningsCents} />
              <RowLine label="Social Security (12.4%, capped)" cents={position.se.socialSecurityCents} />
              <RowLine label="Medicare (2.9%)" cents={position.se.medicareCents} />
              <tr className="border-t border-line font-bold">
                <td>Total SE tax</td>
                <td className="num">
                  <Money cents={position.se.totalSeTaxCents} />
                </td>
              </tr>
              <RowLine label="Deductible half" cents={position.se.halfDeductibleCents} />
            </tbody>
          </table>
        </section>

        {/* Home office worksheet */}
        <section>
          <h3 className="mb-3 font-bold">Home Office Worksheet (Form 8829 / simplified)</h3>
          {taxConfig?.home_office_sqft ? (
            <p className="text-sm">
              Simplified method: {taxConfig.home_office_sqft} sq ft × $5 (cap 300 sq ft) ={" "}
              <span className="num">
                <Money cents={Math.min(taxConfig.home_office_sqft, 300) * 5 * 100} />
              </span>
            </p>
          ) : (
            <p className="text-sm text-ink-faint">
              No home office configured. Set square footage in Settings to include this deduction.
            </p>
          )}
        </section>

        {/* Depreciation + mileage placeholders */}
        <section>
          <h3 className="mb-3 font-bold">Depreciation Schedule</h3>
          <p className="text-sm text-ink-faint">
            See account 5900 Equipment &amp; Depreciation in the attached GL export. Section 179 /
            bonus elections require CPA confirmation.
          </p>
        </section>

        <section>
          <h3 className="mb-3 font-bold">Mileage Log Summary</h3>
          <p className="text-sm">
            Business miles recorded: {taxConfig?.business_miles ?? 0}. Vehicle method:{" "}
            {taxConfig?.vehicle_method ?? "not set"}.
          </p>
        </section>

        {/* Estimated total */}
        <section className="border-t border-line pt-4">
          <h3 className="mb-3 font-bold">Estimated Tax Summary</h3>
          <table className="ledger">
            <tbody>
              <RowLine label="Federal income tax (est.)" cents={position.federalIncomeTaxCents} />
              <RowLine label="Self-employment tax" cents={position.se.totalSeTaxCents} />
              <RowLine label="Oklahoma income tax (est.)" cents={position.okIncomeTaxCents} />
              <tr className="border-t-2 border-ink font-bold">
                <td>Total estimated tax</td>
                <td className="num">
                  <Money cents={position.grandTotalCents} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-faint">
            These are LedgerOne estimates to organize the return, not filed figures. The GL export is
            the source of truth; every line above ties back to it.
          </p>
        </section>
      </article>
    </div>
  );
}

function RowLine({ label, cents }: { label: string; cents: number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        <Money cents={cents} />
      </td>
    </tr>
  );
}
