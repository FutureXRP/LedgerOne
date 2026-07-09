// LedgerOne — Server-side data access.
// Thin, typed wrappers over Supabase queries and the reporting RPCs.
// All money comes back as integer cents from the SQL views — never summed here.

import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  AccountType,
  Business,
  Transaction,
  CategorizationRule,
  TaxConfig,
  PnlRow,
  BalanceSheetRow,
  ScheduleCRow,
} from "@/lib/types";

const DEFAULT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_BUSINESS_SLUG || "passagelab";

/** True when Supabase env is present. Pages use this to render an empty state
 * instead of crashing before the project is configured. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getBusiness(slug: string = DEFAULT_SLUG): Promise<Business | null> {
  if (!isConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data as Business | null;
}

export async function getAccounts(businessId: string): Promise<Account[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("code");
  return (data ?? []) as Account[];
}

export async function getActiveRules(businessId: string): Promise<CategorizationRule[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categorization_rules")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("confidence", { ascending: false });
  return (data ?? []) as CategorizationRule[];
}

export async function getPendingTransactions(businessId: string): Promise<Transaction[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("date", { ascending: true });
  return (data ?? []) as Transaction[];
}

export async function getRecentTransactions(
  businessId: string,
  limit = 50
): Promise<Transaction[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(limit);
  return (data ?? []) as Transaction[];
}

export async function getTaxConfig(businessId: string, year: number): Promise<TaxConfig | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tax_config")
    .select("*")
    .eq("business_id", businessId)
    .eq("year", year)
    .is("deleted_at", null)
    .maybeSingle();
  return data as TaxConfig | null;
}

// --- Reporting RPCs (numbers come from SQL, per the Iron Rule) ---

export async function getPnl(businessId: string, from: string, to: string): Promise<PnlRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("pnl", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
  });
  return (data ?? []) as PnlRow[];
}

export async function getBalanceSheet(
  businessId: string,
  asOf: string
): Promise<BalanceSheetRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("balance_sheet", {
    p_business_id: businessId,
    p_as_of: asOf,
  });
  return (data ?? []) as BalanceSheetRow[];
}

export async function getScheduleCRollup(
  businessId: string,
  from: string,
  to: string
): Promise<ScheduleCRow[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("schedule_c_rollup", {
    p_business_id: businessId,
    p_from: from,
    p_to: to,
  });
  return (data ?? []) as ScheduleCRow[];
}

/** Net profit (income - expense) for a range, computed from the rollup RPC. */
export async function getNetProfitCents(
  businessId: string,
  from: string,
  to: string
): Promise<{ incomeCents: number; expenseCents: number; netCents: number }> {
  const rows = await getScheduleCRollup(businessId, from, to);
  let incomeCents = 0;
  let expenseCents = 0;
  for (const r of rows) {
    if (r.section === "income") incomeCents += Number(r.amount_cents);
    else expenseCents += Number(r.amount_cents);
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

export interface AccountBalance {
  account_id: string;
  code: string;
  name: string;
  type: AccountType;
  is_contra: boolean;
  natural_cents: number;
}

/** All-time natural balances per account, from the reporting view. */
export async function getAccountBalances(businessId: string): Promise<AccountBalance[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("v_account_balances")
    .select("account_id, code, name, type, is_contra, natural_cents")
    .eq("business_id", businessId)
    .order("code");
  return (data ?? []) as AccountBalance[];
}

/** Ledger register: entries joined to txn + account, most recent first. */
export async function getRegister(businessId: string, accountId?: string) {
  const supabase = createClient();
  let query = supabase
    .from("ledger_entries")
    .select(
      "id, amount_cents, memo, account_id, accounts!inner(code, name, type, business_id), transactions!inner(id, date, description, status, business_id)"
    )
    .is("deleted_at", null)
    .eq("accounts.business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (accountId) query = query.eq("account_id", accountId);
  const { data } = await query;
  return data ?? [];
}
