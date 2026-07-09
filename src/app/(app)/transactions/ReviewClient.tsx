"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { displayDate } from "@/lib/dates";
import { categorizeTransaction, skipTransaction, createRule } from "@/app/actions";
import type { Account, Business, Transaction } from "@/lib/types";

export function ReviewClient({
  business,
  accounts,
  pending,
}: {
  business: Business;
  accounts: Account[];
  pending: Transaction[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [makeRule, setMakeRule] = useState(false);

  const bankAccounts = accounts.filter((a) => a.type === "asset" || a.type === "liability");
  const categoryAccounts = accounts.filter((a) => a.type === "income" || a.type === "expense");

  const txn = pending[index];
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");

  // When the current transaction changes, prime the category from the AI suggestion.
  const suggestion = useMemo(() => txn?.ai_suggested_account_id ?? "", [txn]);
  useEffect(() => {
    setCategoryId(suggestion || categoryAccounts[0]?.id || "");
    setMakeRule(false);
    setError(null);
  }, [txn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(async () => {
    if (!txn || busy) return;
    if (!bankAccountId || !categoryId) {
      setError("Choose both a bank/clearing account and a category.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await categorizeTransaction({
      transactionId: txn.id,
      bankAccountId,
      categoryAccountId: categoryId,
      amountCents: Number(txn.external_amount_cents ?? 0),
      memo: txn.description,
    });
    if (!res.ok) {
      setError(res.error ?? "Failed to post entry.");
      setBusy(false);
      return;
    }
    if (makeRule && txn.description.trim()) {
      await createRule({
        businessId: business.id,
        matchType: "contains",
        pattern: firstToken(txn.description),
        accountId: categoryId,
        fromAi: Boolean(suggestion),
      });
    }
    setBusy(false);
    advance();
  }, [txn, busy, bankAccountId, categoryId, makeRule]); // eslint-disable-line

  const skip = useCallback(async () => {
    if (!txn || busy) return;
    setBusy(true);
    await skipTransaction(txn.id);
    setBusy(false);
    advance();
  }, [txn, busy]); // eslint-disable-line

  function advance() {
    if (index >= pending.length - 1) {
      router.refresh();
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
  }

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); accept(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); skip(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); setMakeRule((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accept, skip]);

  if (pending.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-lg font-semibold text-ledger-green">Queue is empty.</p>
        <p className="mt-1 text-sm text-ink-faint">Every transaction is categorized.</p>
      </div>
    );
  }

  if (!txn) return null;

  const amount = Number(txn.external_amount_cents ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-faint">
        <span>
          {index + 1} of {pending.length}
        </span>
        <span>{txn.source.toUpperCase()}</span>
      </div>

      <div className="card space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-ink-faint">{displayDate(txn.date)}</div>
            <div className="mt-1 text-lg font-semibold">{txn.description || "(no description)"}</div>
          </div>
          <div className={`text-2xl font-bold ${amount < 0 ? "text-ledger-red" : "text-ledger-green"}`}>
            {formatCents(amount)}
          </div>
        </div>

        {txn.ai_rationale && (
          <div className="rounded-md bg-paper px-3 py-2 text-xs text-ink-soft">
            Suggestion: {txn.ai_rationale}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{amount >= 0 ? "Deposited to" : "Paid from"}</label>
            <select className="input mt-1" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— choose —</option>
              {categoryAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={makeRule} onChange={(e) => setMakeRule(e.target.checked)} />
          Also make a rule: always categorize <code className="rounded bg-paper px-1">{firstToken(txn.description)}</code> this way
        </label>

        {error && <p className="text-sm text-ledger-red">{error}</p>}

        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={accept} disabled={busy}>
            Accept & post (A)
          </button>
          <button className="btn-ghost" onClick={skip} disabled={busy}>
            Skip (S)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Take a stable-ish token from a bank description to seed a "contains" rule. */
function firstToken(description: string): string {
  const cleaned = description.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  return (words[0] ?? cleaned).slice(0, 40);
}
