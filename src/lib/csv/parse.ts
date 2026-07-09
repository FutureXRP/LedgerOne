// LedgerOne — CSV import parsing (Phase 1 ingestion).
//
// Bank and credit-card exports vary. We detect the common column shapes:
//   - a single signed "Amount" column, or
//   - separate "Debit"/"Credit" columns.
// Output is StagedRow[] with amounts in signed cents (positive = money in).

import Papa from "papaparse";
import { dollarsToCents } from "@/lib/money";
import type { StagedRow } from "@/lib/types";

const DATE_KEYS = ["date", "transaction date", "posted date", "posting date", "trans date"];
const DESC_KEYS = ["description", "name", "memo", "payee", "details", "transaction"];
const AMOUNT_KEYS = ["amount", "amount ($)"];
const DEBIT_KEYS = ["debit", "withdrawal", "withdrawals", "money out"];
const CREDIT_KEYS = ["credit", "deposit", "deposits", "money in"];
const REF_KEYS = ["reference", "ref", "transaction id", "id", "check number"];

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  const lowerMap = new Map<string, string>();
  for (const k of Object.keys(row)) lowerMap.set(k.trim().toLowerCase(), k);
  for (const want of keys) {
    const actual = lowerMap.get(want);
    if (actual !== undefined) {
      const v = row[actual];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return undefined;
}

/** Normalize a date string to ISO YYYY-MM-DD. Accepts M/D/YYYY and YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export interface ParseResult {
  rows: StagedRow[];
  skipped: { line: number; reason: string }[];
  detectedColumns: { date?: string; description?: string; amountMode: "single" | "debit_credit" | "unknown" };
}

export function parseBankCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: StagedRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  // Detect amount mode from the first data row.
  const first = parsed.data[0] ?? {};
  const hasSingle = pick(first, AMOUNT_KEYS) !== undefined;
  const hasDebit = pick(first, DEBIT_KEYS) !== undefined || pick(first, CREDIT_KEYS) !== undefined;
  const amountMode: ParseResult["detectedColumns"]["amountMode"] = hasSingle
    ? "single"
    : hasDebit
    ? "debit_credit"
    : "unknown";

  parsed.data.forEach((row, idx) => {
    const lineNo = idx + 2; // header is line 1
    const rawDate = pick(row, DATE_KEYS);
    const description = pick(row, DESC_KEYS) ?? "";
    const date = rawDate ? normalizeDate(rawDate) : null;

    if (!date) {
      skipped.push({ line: lineNo, reason: `Unrecognized or missing date: "${rawDate ?? ""}"` });
      return;
    }

    let amountCents: number | null = null;
    try {
      if (amountMode === "single") {
        const a = pick(row, AMOUNT_KEYS);
        if (a !== undefined) amountCents = dollarsToCents(a);
      } else {
        const debit = pick(row, DEBIT_KEYS);
        const credit = pick(row, CREDIT_KEYS);
        const debitCents = debit ? dollarsToCents(debit) : 0;
        const creditCents = credit ? dollarsToCents(credit) : 0;
        // Debit = money out (negative), credit = money in (positive).
        amountCents = creditCents - Math.abs(debitCents);
      }
    } catch (e) {
      skipped.push({ line: lineNo, reason: (e as Error).message });
      return;
    }

    if (amountCents === null || amountCents === 0) {
      skipped.push({ line: lineNo, reason: "No usable amount" });
      return;
    }

    const ref = pick(row, REF_KEYS) ?? `${date}|${description}|${amountCents}`;
    rows.push({
      date,
      description,
      amount_cents: amountCents,
      source_ref: ref,
    });
  });

  return {
    rows,
    skipped,
    detectedColumns: {
      date: rawFirstKey(first, DATE_KEYS),
      description: rawFirstKey(first, DESC_KEYS),
      amountMode,
    },
  };
}

function rawFirstKey(row: Record<string, string>, keys: string[]): string | undefined {
  const lowerMap = new Map<string, string>();
  for (const k of Object.keys(row)) lowerMap.set(k.trim().toLowerCase(), k);
  for (const want of keys) if (lowerMap.has(want)) return lowerMap.get(want);
  return undefined;
}
