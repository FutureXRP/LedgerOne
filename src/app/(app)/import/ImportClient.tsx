"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseBankCsv } from "@/lib/csv/parse";
import { formatCents } from "@/lib/money";
import { displayDate } from "@/lib/dates";
import { importStagedRows } from "@/app/actions";
import type { Account, Business, StagedRow } from "@/lib/types";

export function ImportClient({ business, accounts }: { business: Business; accounts: Account[] }) {
  const router = useRouter();
  const [staged, setStaged] = useState<StagedRow[]>([]);
  const [skipped, setSkipped] = useState<{ line: number; reason: string }[]>([]);
  const [phase, setPhase] = useState<"idle" | "parsing" | "suggesting" | "preview" | "importing" | "done">("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase("parsing");
    const text = await file.text();
    const result = parseBankCsv(text);
    setSkipped(result.skipped);

    if (result.rows.length === 0) {
      setStaged([]);
      setPhase("preview");
      return;
    }

    setPhase("suggesting");
    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: business.id, rows: result.rows }),
      });
      const data = await res.json();
      setStaged(data.rows ?? result.rows);
    } catch {
      setStaged(result.rows);
    }
    setPhase("preview");
  }

  async function doImport() {
    setPhase("importing");
    const res = await importStagedRows(business.id, staged);
    setSummary(
      `Imported ${res.inserted} transaction${res.inserted === 1 ? "" : "s"}` +
        (res.duplicates ? `, skipped ${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"}` : "") +
        "."
    );
    setPhase("done");
    router.refresh();
  }

  const codeName = (code?: string) => {
    if (!code) return "—";
    const a = accounts.find((x) => x.code === code);
    return a ? `${a.code} ${a.name}` : code;
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">Statement CSV</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="mt-2 block text-sm"
          disabled={phase === "suggesting" || phase === "importing"}
        />
        <p className="mt-2 text-xs text-ink-faint">
          Expected columns: a date, a description, and either a signed <code>Amount</code> column or
          separate <code>Debit</code>/<code>Credit</code> columns.
        </p>
      </div>

      {phase === "suggesting" && (
        <p className="text-sm text-ink-soft">Parsing and requesting categorization suggestions…</p>
      )}

      {phase === "done" && summary && (
        <div className="rounded-lg border border-ledger-green/30 bg-green-50 p-4 text-sm text-ledger-green">
          {summary}{" "}
          <a href="/transactions" className="underline">
            Go to review queue
          </a>
        </div>
      )}

      {(phase === "preview" || phase === "importing") && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {staged.length} row{staged.length === 1 ? "" : "s"} ready
            </h2>
            <button
              className="btn-primary"
              onClick={doImport}
              disabled={staged.length === 0 || phase === "importing"}
            >
              {phase === "importing" ? "Importing…" : `Import ${staged.length}`}
            </button>
          </div>

          {staged.length > 0 && (
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th>Suggested account</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {staged.map((r) => (
                    <tr key={r.source_ref}>
                      <td className="whitespace-nowrap">{displayDate(r.date)}</td>
                      <td className="max-w-xs truncate">{r.description}</td>
                      <td className="num">{formatCents(r.amount_cents)}</td>
                      <td>
                        <span className={r.rule_matched ? "text-ledger-green" : ""}>
                          {codeName(r.suggested_account_code)}
                        </span>
                      </td>
                      <td className="text-xs text-ink-faint">{r.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {skipped.length > 0 && (
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold text-ledger-amber">
            {skipped.length} row{skipped.length === 1 ? "" : "s"} skipped
          </h3>
          <ul className="space-y-1 text-xs text-ink-faint">
            {skipped.slice(0, 20).map((s) => (
              <li key={s.line}>
                Line {s.line}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
