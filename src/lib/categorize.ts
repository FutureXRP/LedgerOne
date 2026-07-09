// LedgerOne — Deterministic categorization (rules engine).
//
// Rules run first and are the source of truth. Claude only suggests where no
// rule matches (README Phase 1). A rule never posts an entry — it proposes an
// account for the review queue, and auto-apply still lands the txn as
// 'categorized' for a human glance, not 'reconciled'.

import type { CategorizationRule, Account } from "@/lib/types";

export interface RuleMatch {
  account_id: string;
  account_code: string;
  rule_id: string;
  confidence: number;
}

/** Return the highest-confidence matching rule for a description, or null. */
export function matchRule(
  description: string,
  rules: CategorizationRule[],
  accountsById: Map<string, Account>
): RuleMatch | null {
  const hay = description.toLowerCase();
  let best: RuleMatch | null = null;

  for (const r of rules) {
    if (!r.is_active) continue;
    let hit = false;
    const pat = r.pattern;
    switch (r.match_type) {
      case "contains":
        hit = hay.includes(pat.toLowerCase());
        break;
      case "exact":
        hit = hay === pat.toLowerCase();
        break;
      case "regex":
        try {
          hit = new RegExp(pat, "i").test(description);
        } catch {
          hit = false;
        }
        break;
    }
    if (hit) {
      const acct = accountsById.get(r.account_id);
      if (!acct) continue;
      if (!best || r.confidence > best.confidence) {
        best = {
          account_id: r.account_id,
          account_code: acct.code,
          rule_id: r.id,
          confidence: r.confidence,
        };
      }
    }
  }
  return best;
}
