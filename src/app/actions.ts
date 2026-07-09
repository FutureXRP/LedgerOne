// LedgerOne — Server Actions.
// Mutations funnel through here. We use the admin client for multi-row ledger
// writes so a single balanced transaction lands atomically; the DB triggers
// (zero-sum, period lock, soft-delete) are the real guardrails.

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { buildBankLegs, buildJournalLegs, type LegSpec } from "@/lib/ledger";
import { dollarsToCents } from "@/lib/money";
import type { StagedRow } from "@/lib/types";

/**
 * Stage parsed CSV rows as `pending` transactions (no ledger entries yet).
 * Duplicate source_refs are skipped by the DB unique index.
 */
export async function importStagedRows(businessId: string, rows: StagedRow[]) {
  const admin = createAdminClient();
  let inserted = 0;
  let duplicates = 0;

  for (const r of rows) {
    const { error } = await admin.from("transactions").insert({
      business_id: businessId,
      date: r.date,
      description: r.description,
      source: "csv",
      source_ref: r.source_ref,
      external_amount_cents: r.amount_cents,
      status: "pending",
      ai_suggested_account_id: r.suggested_account_id ?? null,
      ai_rationale: r.rationale ?? null,
    });
    if (error) {
      if (error.code === "23505") duplicates++;
      // otherwise swallow-and-continue; the import summary reports counts
    } else {
      inserted++;
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  return { inserted, duplicates, total: rows.length };
}

/**
 * Categorize a pending transaction: post the balanced two-legged entry against
 * a bank/clearing account and the chosen category, then mark it categorized.
 */
export async function categorizeTransaction(params: {
  transactionId: string;
  bankAccountId: string;
  categoryAccountId: string;
  amountCents: number;
  memo?: string;
}) {
  const admin = createAdminClient();
  const legs = buildBankLegs({
    bankAccountId: params.bankAccountId,
    categoryAccountId: params.categoryAccountId,
    amountCents: params.amountCents,
    memo: params.memo,
  });

  const { error: legErr } = await admin.from("ledger_entries").insert(
    legs.map((l) => ({
      transaction_id: params.transactionId,
      account_id: l.account_id,
      amount_cents: l.amount_cents,
      memo: l.memo ?? null,
    }))
  );
  if (legErr) return { ok: false, error: legErr.message };

  const { error: statusErr } = await admin
    .from("transactions")
    .update({ status: "categorized" })
    .eq("id", params.transactionId);
  if (statusErr) return { ok: false, error: statusErr.message };

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}

/** Split a transaction across multiple category legs (must still balance to bank). */
export async function splitTransaction(params: {
  transactionId: string;
  bankAccountId: string;
  amountCents: number;
  splits: { categoryAccountId: string; amountCents: number; memo?: string }[];
}) {
  const admin = createAdminClient();
  try {
    const categoryLegs: LegSpec[] = params.splits.map((s) => ({
      account_id: s.categoryAccountId,
      amount_cents: -s.amountCents,
      memo: s.memo,
    }));
    const bankLeg: LegSpec = { account_id: params.bankAccountId, amount_cents: params.amountCents };
    const legs = buildJournalLegs([bankLeg, ...categoryLegs]);

    const { error } = await admin.from("ledger_entries").insert(
      legs.map((l) => ({
        transaction_id: params.transactionId,
        account_id: l.account_id,
        amount_cents: l.amount_cents,
        memo: l.memo ?? null,
      }))
    );
    if (error) return { ok: false, error: error.message };

    await admin.from("transactions").update({ status: "categorized" }).eq("id", params.transactionId);
    revalidatePath("/transactions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Soft-delete (skip) a pending transaction. */
export async function skipTransaction(transactionId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", transactionId);
  revalidatePath("/transactions");
  return { ok: !error, error: error?.message };
}

/** Create a categorization rule, optionally from an accepted AI suggestion. */
export async function createRule(params: {
  businessId: string;
  matchType: "contains" | "regex" | "exact";
  pattern: string;
  accountId: string;
  fromAi?: boolean;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("categorization_rules").insert({
    business_id: params.businessId,
    match_type: params.matchType,
    pattern: params.pattern,
    account_id: params.accountId,
    created_from: params.fromAi ? "ai_accepted" : "manual",
  });
  revalidatePath("/settings");
  return { ok: !error, error: error?.message };
}

/** Post a manual journal entry from typed dollar strings. */
export async function postManualJournal(params: {
  businessId: string;
  date: string;
  description: string;
  legs: { accountId: string; amount: string }[]; // amount as dollar string, signed
}) {
  const admin = createAdminClient();
  try {
    const legs = buildJournalLegs(
      params.legs
        .filter((l) => l.accountId && l.amount.trim() !== "")
        .map((l) => ({ account_id: l.accountId, amount_cents: dollarsToCents(l.amount) }))
    );

    const { data: txn, error: txnErr } = await admin
      .from("transactions")
      .insert({
        business_id: params.businessId,
        date: params.date,
        description: params.description,
        source: "manual",
        status: "categorized",
      })
      .select("id")
      .single();
    if (txnErr || !txn) return { ok: false, error: txnErr?.message ?? "Failed to create transaction" };

    const { error: legErr } = await admin.from("ledger_entries").insert(
      legs.map((l) => ({
        transaction_id: txn.id,
        account_id: l.account_id,
        amount_cents: l.amount_cents,
        memo: l.memo ?? null,
      }))
    );
    if (legErr) {
      // Roll back the header if the balanced legs failed to land.
      await admin.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", txn.id);
      return { ok: false, error: legErr.message };
    }

    revalidatePath("/ledger");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Update (or insert) the tax configuration for a business year. */
export async function saveTaxConfig(params: {
  businessId: string;
  year: number;
  homeOfficeSqft: string;
  homeTotalSqft: string;
  vehicleMethod: string;
  businessMiles: string;
  priorYearTax: string; // dollar string
  priorYearAgi: string; // dollar string
  filingStatus: string;
  seTaxApplicable: boolean;
  verifiedByCpa: boolean;
}) {
  const admin = createAdminClient();
  const toInt = (s: string) => (s.trim() === "" ? null : Math.trunc(Number(s.replace(/[,\s]/g, ""))));
  const toCents = (s: string) => (s.trim() === "" ? null : dollarsToCents(s));

  const { error } = await admin.from("tax_config").upsert(
    {
      business_id: params.businessId,
      year: params.year,
      home_office_sqft: toInt(params.homeOfficeSqft),
      home_total_sqft: toInt(params.homeTotalSqft),
      vehicle_method: params.vehicleMethod || null,
      business_miles: toInt(params.businessMiles) ?? 0,
      prior_year_tax_cents: toCents(params.priorYearTax),
      prior_year_agi_cents: toCents(params.priorYearAgi),
      filing_status: params.filingStatus,
      se_tax_applicable: params.seTaxApplicable,
      verified_by_cpa: params.verifiedByCpa,
    },
    { onConflict: "business_id,year" }
  );
  revalidatePath("/settings");
  revalidatePath("/tax");
  revalidatePath("/");
  return { ok: !error, error: error?.message };
}

/** Soft-delete a categorization rule. */
export async function deleteRule(ruleId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("categorization_rules")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", ruleId);
  revalidatePath("/settings");
  return { ok: !error, error: error?.message };
}

/** Lock a period. Entries dated on/before period_end become immutable. */
export async function lockPeriod(businessId: string, periodEndDate: string, note?: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("locks")
    .insert({ business_id: businessId, period_end_date: periodEndDate, note: note ?? null });
  revalidatePath("/reports/close");
  return { ok: !error, error: error?.message };
}
