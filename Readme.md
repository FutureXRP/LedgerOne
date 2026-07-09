# LEDGERONE.md — Build Bible
## Personal Accounting + Tax Platform for PassageLab, LLC

**Status:** Planning — not yet built
**Owner:** Matt Blair
**Purpose:** Replace QuickBooks + TurboTax for PassageLab, LLC (Oklahoma). Single-tenant, personal use only. Not for resale.
**This document is the Claude Code handoff reference.** Same role as FOOTSTEPS_PROJECT.md and PROSTUDIO.md play for their projects.

---

## 1. What This Is (and Isn't)

LedgerOne is a private, single-user accounting and tax-preparation platform for one business: PassageLab, LLC. It keeps double-entry books all year and assembles a review-ready federal + Oklahoma tax package at year end.

**It is:**
- A double-entry general ledger with bank/Stripe transaction ingestion
- An AI-assisted (never AI-decided) transaction categorization system
- A real-time tax position dashboard with quarterly estimated payment calculations
- A year-end tax package generator: Schedule C worksheet (or 1120-S if S-corp election is made), depreciation schedule, home office worksheet, OK Form 511 supporting data

**It is not:**
- Multi-tenant SaaS. One user. One business. No billing, no signup, no marketing site.
- An e-filing platform. No IRS MeF integration. Output is a complete, CPA-review-ready package. Filing happens through a CPA or a free-file tool using LedgerOne's numbers.
- Payroll software. If PassageLab ever runs payroll, use Gusto and import the journal entries.

**Scope discipline:** Because this is personal-use, every "what if a user does X" question resolves to "Matt won't." No input sanitization theater, no rate limiting, no onboarding flows. Auth is a single Supabase account. This should cut build time by 70% versus the commercial version.

---

## 2. Entity Context (Verify with CPA — Do Not Hardcode Assumptions)

- **Entity:** PassageLab, LLC — Oklahoma LLC, formation documents completed
- **Default federal treatment:** Single-member LLC → disregarded entity → **Schedule C** on the 1040
- **Open question:** S-corp election (Form 2553). Changes the entire tax module (1120-S + K-1 + reasonable-salary payroll requirement). **Build for Schedule C first; architect the tax-mapping layer so form targets are configurable, not hardcoded.**
- **State:** Oklahoma. Income flows to OK Form 511 (personal return). No separate OK entity-level income tax for a disregarded SMLLC, but track OK franchise/registered agent obligations as calendar reminders.
- **Multi-business future:** Matt also owns a medical practice and other ventures. v1 is PassageLab only, but the schema includes a `business_id` on every table so a second set of books can be added later without a migration rewrite.

> ⚠️ **Standing rule:** LedgerOne computes and organizes. It does not give tax advice. Every tax-affecting configuration (home office %, vehicle method, depreciation elections, S-corp election) gets a `verified_by_cpa: boolean` flag and a dashboard warning until confirmed.

---

## 3. Stack

Standard Matt stack, minimal footprint:

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Deployed on Vercel |
| Database | Supabase (Postgres) | Ledger integrity lives HERE — constraints, not app code |
| Auth | Supabase Auth | Single user. Email + password. No OAuth complexity. |
| AI | Anthropic API | Categorization *suggestions* and natural-language report queries only |
| File storage | Supabase Storage | Receipt images, statement PDFs, generated tax packages |
| Ingestion v1 | CSV import | Bank + credit card statement exports. Free, reliable, no vendor dependency. |
| Ingestion v2 | Stripe API | Direct pull of PassageLab revenue: charges, fees, refunds, payouts |
| Ingestion v3 (optional) | Plaid | Only if CSV workflow becomes annoying. ~$0–30/mo dev tier. Decide later. |
| PDF generation | React-pdf or Puppeteer | Year-end tax package output |

**GitHub repo:** `FutureXRP/LedgerOne` (create on first build session)

---

## 4. The Iron Rule (Same as CodeCompanion)

**Claude handles language. Deterministic code handles money.**

- The AI may *suggest* "this $20.00 charge to ELEVENLABS looks like `Software & Subscriptions`."
- The AI never posts an entry, computes a balance, calculates depreciation, or produces a tax number.
- Every dollar figure in every report must be traceable to ledger rows via SQL. If a number can't be reproduced by a query, it doesn't ship.
- All math in integer **cents**, never floats. Postgres `bigint`. Display formatting is a view-layer concern.

---

## 5. Data Model (Core Tables)

```
businesses        id, name, entity_type, tax_treatment, state, fiscal_year_start
accounts          id, business_id, code, name, type (asset|liability|equity|income|expense),
                  subtype, tax_line_mapping, is_active
transactions      id, business_id, date, description, source (csv|stripe|manual),
                  source_ref, status (pending|categorized|reconciled|locked)
ledger_entries    id, transaction_id, account_id, amount_cents (signed),
                  memo, created_at
                  -- CONSTRAINT: entries per transaction must sum to zero (trigger-enforced)
categorization_rules  id, match_type (contains|regex|exact), pattern, account_id,
                      confidence, hit_count, created_from (manual|ai_accepted)
attachments       id, transaction_id, storage_path, kind (receipt|statement|other)
tax_config        id, business_id, year, home_office_pct, vehicle_method,
                  se_tax_applicable, ok_apportionment, verified_by_cpa
tax_snapshots     id, business_id, as_of_date, ytd_income_cents, ytd_expense_cents,
                  est_se_tax_cents, est_federal_cents, est_ok_cents, generated_by (sql_view)
locks             id, business_id, period_end_date, locked_at
                  -- No edits to entries dated on/before a locked period. Trigger-enforced.
```

**Non-negotiable database rules:**
1. Zero-sum trigger on `ledger_entries` per transaction. The database physically cannot hold an unbalanced entry.
2. Period locking. Once a month is reconciled and locked, entries in that period are immutable. Corrections are new dated entries, never edits. This is what makes the books audit-defensible.
3. Soft-delete only, everywhere. `deleted_at`, never `DELETE`.

---

## 6. Chart of Accounts (PassageLab Starter)

Pre-seeded, mapped to Schedule C lines. Tailored to what PassageLab actually spends money on:

**Income**
- 4000 Subscription Revenue — Practical ($5)
- 4010 Subscription Revenue — Scholarly Depth ($10)
- 4020 Subscription Revenue — Academic ($20)
- 4900 Refunds & Chargebacks (contra)

**Expenses (Schedule C line in brackets)**
- 5000 Merchant Processing Fees — Stripe [Line 10, Commissions/fees]
- 5100 Software & Subscriptions [Line 27a, Other] — Anthropic API, ElevenLabs, Supabase, Vercel, domains
- 5110 AI/API Usage — Anthropic [Line 27a] — broken out separately; this is PassageLab's COGS-like driver and worth tracking per-month against revenue
- 5120 Audio Generation — ElevenLabs [Line 27a]
- 5200 Advertising & Marketing [Line 8]
- 5300 Legal & Professional [Line 17] — LLC formation, CPA, any IP/permissions work
- 5400 Office Expense [Line 18]
- 5500 Business Insurance [Line 15]
- 5600 Bank & Service Charges [Line 27a]
- 5700 Education & Research Materials [Line 27a] — commentaries, theological resources used to build/validate content
- 5800 Home Office (via Form 8829 or simplified method) [Line 30]
- 5900 Equipment & Depreciation [Line 13]

**Equity**
- 3000 Owner Contributions
- 3100 Owner Draws

The gross-vs-net Stripe question is handled correctly from day one: revenue posts **gross**, Stripe fees post as expense. Payouts are transfers, not income. (This is the #1 books error solo SaaS founders make.)

---

## 7. Modules & Build Phases

### Phase 1 — The Ledger (build first, everything depends on it)
- Schema + triggers + seed chart of accounts
- Manual journal entry UI (rarely used, but proves the engine)
- CSV import: upload bank/card export → parse → stage as `pending` transactions
- Transaction review queue: pending items shown one-per-card, keyboard-driven (accept suggestion / recategorize / split / attach receipt)
- Rules engine: "always categorize ELEVENLABS → 5120" with auto-apply on future imports
- Claude suggestion layer for anything no rule catches

### Phase 2 — Reports
- P&L (monthly, quarterly, YTD, custom range)
- Balance Sheet
- Account register drill-down (click any report number → see the entries)
- Stripe revenue reconciliation view: Stripe gross vs. bank deposits vs. fees
- Monthly close checklist + period lock button

### Phase 3 — Tax Engine
- Schedule C mapping view: every account rolls up to its form line, live, all year
- Self-employment tax calculation (SE tax = the number that surprises everyone)
- Quarterly estimated payments: federal 1040-ES + Oklahoma OW-8-ES, with safe-harbor logic (110%/100% prior year vs. 90% current year) and due-date reminders
- Year-end package generator (PDF): Schedule C worksheet, 8829 home office worksheet, depreciation schedule, mileage log summary, complete GL export, and a "hand this folder to your CPA" cover sheet

### Phase 4 — Stripe Direct Integration
- Nightly pull of charges, fees, refunds, payouts via Stripe API
- Auto-posted with the gross/fee/payout pattern from Section 6
- Replaces the revenue side of CSV imports entirely

### Phase 5 — Quality of Life (optional, post-ship)
- Receipt capture from phone (photo → Supabase Storage → attach in review queue)
- Natural-language ledger queries ("what did I spend on API costs in Q2?") — Claude translates to SQL against read-only views, results rendered from real query output
- Second business support (medical practice books) — schema already ready
- Plaid, if CSV fatigue sets in

---

## 8. Engineering Standards (Matt's Working Preferences)

- **Complete file replacements over surgical patches.** Every session's output is full files with exact paths.
- **One batch commit per session.**
- **Ship-first.** Phase 1 in production with real PassageLab data before Phase 2 starts. Ugly UI with correct numbers beats the reverse.
- **Exact file paths in all handoff instructions.**
- No em dash rule doesn't apply here (no audio), but keep the discipline: plain, direct copy throughout the UI.

---

## 9. Open Decisions (Resolve Before or During Phase 3)

| # | Decision | Options | Leaning |
|---|---|---|---|
| 1 | S-corp election for PassageLab? | Schedule C (default) vs. 1120-S | Schedule C until revenue justifies payroll overhead — **ask CPA for the crossover number** |
| 2 | Home office deduction method | Simplified ($5/sq ft, cap 300) vs. Form 8829 actual | Simplified for v1; 8829 support later |
| 3 | Accounting method | Cash vs. accrual | Cash. Matches Stripe payouts and sanity. |
| 4 | Historical backfill | Start from LLC formation date vs. Jan 1, 2026 | From formation date — the books should tell the whole story |
| 5 | Plaid | Yes/no/later | Later. CSV first. |
| 6 | Name | LedgerOne is a placeholder | No trademark concerns since it's private — pick whatever feels right |

---

## 10. Definition of Done (v1)

LedgerOne v1 is done when:
1. Every PassageLab transaction since formation is in the ledger, categorized, and reconciled to bank statements
2. The P&L for any month matches what a manual spreadsheet would say, to the cent
3. The quarterly estimate screen produces a federal + OK payment number with the safe-harbor math shown
4. The year-end package generates as a single PDF a CPA could prepare a return from without asking a single "where did this number come from" question
5. QuickBooks and TurboTax subscriptions are cancelled

---

*Build sessions begin when Matt says go. Phase 1, Session 1: repo creation, schema migration, seed chart of accounts, CSV import pipeline.*
