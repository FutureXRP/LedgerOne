// LedgerOne — Shared domain types (mirror the SQL schema).

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type TxnSource = "csv" | "stripe" | "manual";
export type TxnStatus = "pending" | "categorized" | "reconciled" | "locked";
export type MatchType = "contains" | "regex" | "exact";

export interface Business {
  id: string;
  slug: string;
  name: string;
  entity_type: string;
  tax_treatment: string;
  state: string;
  fiscal_year_start: string;
  formation_date: string | null;
}

export interface Account {
  id: string;
  business_id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  tax_line_mapping: string | null;
  is_contra: boolean;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  business_id: string;
  date: string;
  description: string;
  source: TxnSource;
  source_ref: string | null;
  external_amount_cents: number | null;
  status: TxnStatus;
  ai_suggested_account_id: string | null;
  ai_rationale: string | null;
}

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  amount_cents: number;
  memo: string | null;
}

export interface CategorizationRule {
  id: string;
  business_id: string;
  match_type: MatchType;
  pattern: string;
  account_id: string;
  confidence: number;
  hit_count: number;
  created_from: "manual" | "ai_accepted";
  is_active: boolean;
}

export interface TaxConfig {
  id: string;
  business_id: string;
  year: number;
  home_office_pct: number | null;
  home_office_sqft: number | null;
  home_total_sqft: number | null;
  vehicle_method: string | null;
  business_miles: number;
  se_tax_applicable: boolean;
  ok_apportionment: number;
  prior_year_agi_cents: number | null;
  prior_year_tax_cents: number | null;
  filing_status: string;
  verified_by_cpa: boolean;
}

export interface PnlRow {
  section: "income" | "expense";
  account_id: string;
  code: string;
  name: string;
  tax_line_mapping: string | null;
  amount_cents: number;
}

export interface BalanceSheetRow {
  section: AccountType;
  account_id: string;
  code: string;
  name: string;
  amount_cents: number;
}

export interface ScheduleCRow {
  section: "income" | "expense";
  tax_line: string;
  amount_cents: number;
}

/** A staged import row: parsed from CSV, not yet posted to the ledger. */
export interface StagedRow {
  date: string;
  description: string;
  amount_cents: number;
  source_ref: string;
  suggested_account_id?: string;
  suggested_account_code?: string;
  rationale?: string;
  rule_matched?: boolean;
}
