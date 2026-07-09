// LedgerOne — Categorization suggestion endpoint.
//
// Deterministic rules run first (source of truth). For rows no rule catches,
// Claude SUGGESTS an account. The AI never posts, never computes money — it
// returns an account code + one-line rationale for the human review queue
// (README Section 4, the Iron Rule).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { matchRule } from "@/lib/categorize";
import type { Account, CategorizationRule, StagedRow } from "@/lib/types";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export async function POST(req: NextRequest) {
  const { businessId, rows } = (await req.json()) as {
    businessId: string;
    rows: StagedRow[];
  };

  const supabase = createClient();
  const [{ data: accountsData }, { data: rulesData }] = await Promise.all([
    supabase.from("accounts").select("*").eq("business_id", businessId).is("deleted_at", null),
    supabase
      .from("categorization_rules")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  const accounts = (accountsData ?? []) as Account[];
  const rules = (rulesData ?? []) as CategorizationRule[];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const accountsByCode = new Map(accounts.map((a) => [a.code, a]));

  const staged: StagedRow[] = [];
  const needsAi: StagedRow[] = [];

  for (const row of rows) {
    const match = matchRule(row.description, rules, accountsById);
    if (match) {
      staged.push({
        ...row,
        suggested_account_id: match.account_id,
        suggested_account_code: match.account_code,
        rationale: "Matched an existing rule",
        rule_matched: true,
      });
    } else {
      needsAi.push(row);
    }
  }

  // AI suggestions for the remainder (best-effort; degrade gracefully).
  if (needsAi.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const suggestions = await suggestWithClaude(needsAi, accounts);
      for (const row of needsAi) {
        const s = suggestions[row.source_ref];
        const acct = s ? accountsByCode.get(s.code) : undefined;
        staged.push({
          ...row,
          suggested_account_id: acct?.id,
          suggested_account_code: acct?.code,
          rationale: s?.rationale ?? "No confident suggestion",
          rule_matched: false,
        });
      }
    } catch (e) {
      // AI unavailable — stage without suggestions. Human categorizes manually.
      for (const row of needsAi) {
        staged.push({ ...row, rationale: "AI unavailable", rule_matched: false });
      }
    }
  } else {
    for (const row of needsAi) {
      staged.push({ ...row, rationale: "No rule match", rule_matched: false });
    }
  }

  // Preserve input order.
  const order = new Map(rows.map((r, i) => [r.source_ref, i]));
  staged.sort((a, b) => (order.get(a.source_ref) ?? 0) - (order.get(b.source_ref) ?? 0));

  return NextResponse.json({ rows: staged });
}

async function suggestWithClaude(
  rows: StagedRow[],
  accounts: Account[]
): Promise<Record<string, { code: string; rationale: string }>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const catalog = accounts
    .filter((a) => a.type === "income" || a.type === "expense")
    .map((a) => `${a.code} — ${a.name} (${a.type})`)
    .join("\n");

  const items = rows
    .map((r) => {
      const sign = r.amount_cents >= 0 ? "money in" : "money out";
      const amt = (Math.abs(r.amount_cents) / 100).toFixed(2);
      return `id=${r.source_ref} | ${r.date} | ${sign} $${amt} | ${r.description}`;
    })
    .join("\n");

  const prompt = `You categorize bank transactions for a single-member LLC (PassageLab) into a fixed chart of accounts. You only SUGGEST; a human confirms every one. Money math is handled elsewhere — do not compute totals.

Chart of accounts (use the code exactly):
${catalog}

Transactions:
${items}

For each transaction, choose the single best account code. Money-in lines are almost always subscription revenue. Money-out lines are expenses. If unsure, pick the closest and say so briefly.

Respond with ONLY a JSON object mapping each id to {"code": "<account code>", "rationale": "<max 8 words>"}. No prose.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}
