"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRule, deleteRule } from "@/app/actions";
import type { Account, CategorizationRule, MatchType } from "@/lib/types";

type RuleRow = CategorizationRule & { accountLabel: string };

export function RulesManager({
  businessId,
  accounts,
  rules,
}: {
  businessId: string;
  accounts: Account[];
  rules: RuleRow[];
}) {
  const router = useRouter();
  const categories = accounts.filter((a) => a.type === "income" || a.type === "expense");
  const [matchType, setMatchType] = useState<MatchType>("contains");
  const [pattern, setPattern] = useState("");
  const [accountId, setAccountId] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!pattern.trim() || !accountId) return;
    setBusy(true);
    await createRule({ businessId, matchType, pattern: pattern.trim(), accountId });
    setBusy(false);
    setPattern("");
    router.refresh();
  }

  async function remove(id: string) {
    await deleteRule(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label mb-1">Match</label>
          <select className="input" value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)}>
            <option value="contains">contains</option>
            <option value="exact">exact</option>
            <option value="regex">regex</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="label mb-1">Pattern</label>
          <input className="input" placeholder="ELEVENLABS" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </div>
        <div>
          <label className="label mb-1">Account</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {categories.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={add} disabled={busy}>
          Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-ink-faint">No rules yet. Add one, or create one from the review queue.</p>
      ) : (
        <table className="ledger">
          <thead>
            <tr>
              <th>Match</th>
              <th>Pattern</th>
              <th>Account</th>
              <th>Source</th>
              <th className="text-right">Hits</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="text-ink-faint">{r.match_type}</td>
                <td className="font-mono">{r.pattern}</td>
                <td>{r.accountLabel}</td>
                <td className="text-ink-faint">{r.created_from === "ai_accepted" ? "AI-accepted" : "manual"}</td>
                <td className="num">{r.hit_count}</td>
                <td className="text-right">
                  <button className="text-xs text-ledger-red underline" onClick={() => remove(r.id)}>
                    delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
