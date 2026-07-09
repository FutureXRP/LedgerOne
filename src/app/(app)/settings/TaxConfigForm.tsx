"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTaxConfig } from "@/app/actions";
import { formatCents } from "@/lib/money";
import type { TaxConfig } from "@/lib/types";

export function TaxConfigForm({
  businessId,
  year,
  config,
}: {
  businessId: string;
  year: number;
  config: TaxConfig | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    homeOfficeSqft: config?.home_office_sqft?.toString() ?? "",
    homeTotalSqft: config?.home_total_sqft?.toString() ?? "",
    vehicleMethod: config?.vehicle_method ?? "standard_mileage",
    businessMiles: config?.business_miles?.toString() ?? "0",
    priorYearTax: config?.prior_year_tax_cents != null ? (config.prior_year_tax_cents / 100).toString() : "",
    priorYearAgi: config?.prior_year_agi_cents != null ? (config.prior_year_agi_cents / 100).toString() : "",
    filingStatus: config?.filing_status ?? "single",
    seTaxApplicable: config?.se_tax_applicable ?? true,
    verifiedByCpa: config?.verified_by_cpa ?? false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    await saveTaxConfig({ businessId, year, ...form });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Home office sq ft (simplified, cap 300)">
          <input className="input" value={form.homeOfficeSqft} onChange={(e) => set("homeOfficeSqft", e.target.value)} />
        </Field>
        <Field label="Total home sq ft (for actual method %)">
          <input className="input" value={form.homeTotalSqft} onChange={(e) => set("homeTotalSqft", e.target.value)} />
        </Field>
        <Field label="Vehicle method">
          <select className="input" value={form.vehicleMethod} onChange={(e) => set("vehicleMethod", e.target.value)}>
            <option value="standard_mileage">Standard mileage</option>
            <option value="actual">Actual expenses</option>
          </select>
        </Field>
        <Field label="Business miles (YTD)">
          <input className="input" value={form.businessMiles} onChange={(e) => set("businessMiles", e.target.value)} />
        </Field>
        <Field label="Filing status">
          <select className="input" value={form.filingStatus} onChange={(e) => set("filingStatus", e.target.value)}>
            <option value="single">Single</option>
            <option value="married_joint">Married filing jointly</option>
            <option value="married_separate">Married filing separately</option>
            <option value="head_of_household">Head of household</option>
          </select>
        </Field>
        <Field label="Prior-year total tax ($, for safe harbor)">
          <input className="input" value={form.priorYearTax} onChange={(e) => set("priorYearTax", e.target.value)} />
        </Field>
        <Field label="Prior-year AGI ($, 110% threshold)">
          <input className="input" value={form.priorYearAgi} onChange={(e) => set("priorYearAgi", e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.seTaxApplicable} onChange={(e) => set("seTaxApplicable", e.target.checked)} />
        Self-employment tax applies
      </label>

      <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm">
        <input type="checkbox" checked={form.verifiedByCpa} onChange={(e) => set("verifiedByCpa", e.target.checked)} />
        <span>
          <strong>Verified by CPA.</strong> Check only after a CPA confirms these settings. Clears the
          dashboard warnings.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save configuration"}
        </button>
        {saved && <span className="text-sm text-ledger-green">Saved.</span>}
        {form.priorYearTax.trim() !== "" && (
          <span className="text-xs text-ink-faint">
            Safe harbor basis: {formatCents(Math.round(Number(form.priorYearTax) * 100 * (Number(form.priorYearAgi) > 150000 ? 1.1 : 1.0)))}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1">{label}</label>
      {children}
    </div>
  );
}
