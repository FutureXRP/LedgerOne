# LedgerOne — Setup & Run

Private accounting + tax platform for PassageLab, LLC. Single user. See
`Readme.md` for the full build bible; this file is how you actually run it.

## What's built (Phases 1–3)

- **Phase 1 — Ledger:** Postgres schema with the non-negotiable integrity rules
  enforced as DB triggers (zero-sum per transaction, period locking, soft-delete),
  seeded PassageLab chart of accounts mapped to Schedule C lines, CSV import
  pipeline, keyboard-driven review queue, rules engine, and Claude categorization
  suggestions.
- **Phase 2 — Reports:** P&L (YTD / quarter / year), Balance Sheet, account
  register drill-down, monthly close checklist + period lock.
- **Phase 3 — Tax engine:** live Schedule C rollup, Schedule SE tax, federal +
  Oklahoma income tax estimates, quarterly estimated payments with safe-harbor
  logic and due dates, and a print-to-PDF year-end CPA package + GL CSV export.
- **Phase 4–5:** scaffolded (schema has `business_id` everywhere, Stripe/Plaid
  env slots, attachments table). Not yet wired to live integrations.

Every dollar figure comes from SQL (the reporting views/RPCs) — nothing sums money
in JavaScript. The tax math is integer-cents and verified against hand calculations.

## Prerequisites

- Node 20+ (built and tested on Node 22)
- A Supabase project (free tier is fine)
- An Anthropic API key (for categorization suggestions — optional; the app works
  without it, you just categorize manually)

## 1. Install

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API), and
`ANTHROPIC_API_KEY`. Until these are set the app runs but shows a
"configure Supabase" notice instead of data.

## 3. Run the database migrations

The migrations in `supabase/migrations/` must run **in order**. They create the
schema, the integrity triggers, the reporting views, the seed chart of accounts,
and RLS.

**Option A — Supabase CLI (recommended):**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL editor:** paste each file in the Supabase dashboard SQL editor,
in numeric order (0001 → 0005), and run.

This seeds PassageLab, LLC and its full chart of accounts. Re-running is safe
(seeds are idempotent).

## 4. Create your single account

```bash
npm run dev
```

Open http://localhost:3000, go to `/login`, choose "Create the single account",
and sign up with your email + password. That's the one and only user.

## 5. Use it

1. **Import CSV** — upload a bank/card export. Rows stage as pending; rules and
   Claude suggest categories.
2. **Review Queue** — accept / recategorize / skip each one (keyboard: A / S / R).
   Accepting posts a balanced double-entry the database guarantees sums to zero.
3. **Ledger / P&L / Balance Sheet** — every number drills down to the entries.
4. **Monthly Close** — lock a reconciled period; it becomes immutable.
5. **Tax** — live Schedule C, SE tax, quarterly estimates, year-end package.

## Verifying the money engine

```bash
# Pure money + tax math, no DB needed:
node --experimental-strip-types <(cat) # see the test scaffolding used in build notes
```

The deterministic calculations (SE tax, brackets, safe harbor) are checked against
hand-computed figures. If you change a tax constant, re-verify.

## Deploy

Deploy to Vercel. Set the same env vars in the Vercel project. Point it at the
same Supabase project. Nothing else to configure — it's single-tenant.

## Important caveats

- **Not tax advice.** Every tax-affecting setting has a `verified_by_cpa` flag and
  the dashboard warns until you check it in Settings. The year-end package is a
  CPA-review-ready folder, not a filed return.
- **Tax constants** in `src/lib/tax/constants.ts` are best-effort 2025 figures for
  a single filer. Verify with your CPA and update per year.
- **Next.js version:** pinned to the latest patched 14.2.x. `npm audit` flags
  further advisories that are only fixed in the Next 16 line (mostly self-hosted
  image-optimizer / RSC DoS issues); moving to 16 is a separate migration and low
  priority for a private single-user app with image optimization disabled.
