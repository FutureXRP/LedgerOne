"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lockPeriod } from "@/app/actions";
import { isoToday } from "@/lib/dates";

export function CloseClient({ businessId, canLock }: { businessId: string; canLock: boolean }) {
  const router = useRouter();
  const [periodEnd, setPeriodEnd] = useState(isoToday());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lock() {
    setBusy(true);
    setError(null);
    const res = await lockPeriod(businessId, periodEnd, note || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to lock.");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">Lock a period</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Period end date</label>
          <input
            type="date"
            className="input mt-1"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="label">Note (optional)</label>
          <input
            className="input mt-1"
            placeholder="e.g. June 2026 close"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={lock} disabled={busy || !canLock}>
          {busy ? "Locking…" : "Lock period"}
        </button>
      </div>
      {!canLock && (
        <p className="mt-2 text-xs text-ledger-amber">
          Clear the review queue before locking.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-ledger-red">{error}</p>}
    </section>
  );
}
