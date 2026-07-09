// LedgerOne — General Ledger CSV export.
// The complete, source-of-truth export a CPA can reconcile every report against.
// One row per ledger entry, with its transaction and account context.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusiness } from "@/lib/data";
import { formatCents } from "@/lib/money";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const business = await getBusiness();
  if (!business) return new NextResponse("No business", { status: 404 });

  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const supabase = createClient();
  const { data } = await supabase
    .from("ledger_entries")
    .select(
      "amount_cents, memo, accounts!inner(code, name, type, business_id), transactions!inner(date, description, source, status, business_id)"
    )
    .is("deleted_at", null)
    .eq("accounts.business_id", business.id)
    .gte("transactions.date", from)
    .lte("transactions.date", to)
    .order("transactions(date)", { ascending: true });

  const rows = (data ?? []) as any[];

  const header = [
    "date",
    "description",
    "account_code",
    "account_name",
    "account_type",
    "amount",
    "amount_cents",
    "memo",
    "source",
    "status",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.transactions.date,
      csv(r.transactions.description),
      r.accounts.code,
      csv(r.accounts.name),
      r.accounts.type,
      formatCents(Number(r.amount_cents), { symbol: false }),
      String(r.amount_cents),
      csv(r.memo ?? ""),
      r.transactions.source,
      r.transactions.status,
    ];
    lines.push(cells.join(","));
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledgerone-gl-${year}.csv"`,
    },
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
