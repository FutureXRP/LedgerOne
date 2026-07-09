"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dollarsToCents, formatCents } from "@/lib/money";
import { isoToday } from "@/lib/dates";
import { postManualJournal } from "@/app/actions";
import type { Account } from "@/lib/types";

interface Leg {
  accountId: string;
  amount: string;
}

export function ManualJournal({ businessId, accounts }: { businessId: string; accounts: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(isoToday());
  const [description, setDescription] = useState("");
  const [legs, setLegs] = useState<Leg[]>([
    { accountId: "", amount: "" },
    { accountId: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const balanceCents = legs.reduce((sum, l) => {
    try {
      return sum + (l.amount.trim() ? dollarsToCents(l.amount) : 0);
    } catch {
      return sum;
    }
  }, 0);

  function setLeg(i: number, patch: Partial<Leg>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    if (balanceCents !== 0) {
      setError(`Entry must balance to zero. Currently off by ${formatCents(balanceCents)}.`);
      return;
    }
    setBusy(true);
    const res = await postManualJournal({ businessId, date, description, legs });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to post.");
      return;
    }
    setDescription("");
    setLegs([{ accountId: "", amount: "" }, { accountId: "", amount: "" }]);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div>
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          + Manual journal entry
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Manual journal entry</h2>
        <button className="text-sm text-ink-faint underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Legs (debits positive, credits negative — must sum to zero)</div>
        {legs.map((leg, i) => (
          <div key={i} className="flex gap-2">
            <select
              className="input flex-1"
              value={leg.accountId}
              onChange={(e) => setLeg(i, { accountId: e.target.value })}
            >
              <option value="">— account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
            <input
              className="input w-32 text-right"
              placeholder="0.00"
              value={leg.amount}
              onChange={(e) => setLeg(i, { amount: e.target.value })}
            />
          </div>
        ))}
        <button
          className="text-sm text-ink-faint underline"
          onClick={() => setLegs((p) => [...p, { accountId: "", amount: "" }])}
        >
          + add leg
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className={`num text-sm ${balanceCents === 0 ? "text-ledger-green" : "text-ledger-red"}`}>
          Balance: {formatCents(balanceCents)}
        </span>
        <button className="btn-primary" onClick={submit} disabled={busy || balanceCents !== 0}>
          {busy ? "Posting…" : "Post entry"}
        </button>
      </div>

      {error && <p className="text-sm text-ledger-red">{error}</p>}
    </div>
  );
}
