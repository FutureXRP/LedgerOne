import { createClient } from "@/lib/supabase/server";
import { getAccounts, getActiveRules, getBusiness, getTaxConfig } from "@/lib/data";
import { currentYear } from "@/lib/dates";
import { TaxConfigForm } from "./TaxConfigForm";
import { RulesManager } from "./RulesManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getBusiness();
  if (!business) return <p className="text-sm text-ink-soft">No business configured.</p>;

  const year = currentYear();
  const [taxConfig, accounts, rules] = await Promise.all([
    getTaxConfig(business.id, year),
    getAccounts(business.id),
    getActiveRules(business.id),
  ]);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-faint">
          Business: {business.name} · {business.entity_type.toUpperCase()} · {business.state} ·{" "}
          {business.tax_treatment.replace("_", " ")}
        </p>
      </header>

      <section className="card">
        <h2 className="mb-1 font-semibold">Tax configuration — {year}</h2>
        <p className="mb-4 text-xs text-ink-faint">
          Every tax-affecting setting lives here. Leave the CPA-verified box unchecked until a CPA
          confirms these choices — the dashboard warns until then.
        </p>
        <TaxConfigForm businessId={business.id} year={year} config={taxConfig} />
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Categorization rules</h2>
        <p className="mb-4 text-xs text-ink-faint">
          Rules run before AI on every import. Highest confidence wins.
        </p>
        <RulesManager
          businessId={business.id}
          accounts={accounts}
          rules={rules.map((r) => ({
            ...r,
            accountLabel: (() => {
              const a = accountsById.get(r.account_id);
              return a ? `${a.code} ${a.name}` : r.account_id;
            })(),
          }))}
        />
      </section>
    </div>
  );
}
