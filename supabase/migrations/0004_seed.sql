-- LedgerOne — Seed data
-- PassageLab, LLC business + starter chart of accounts (README Section 6),
-- pre-mapped to Schedule C lines. Idempotent: safe to re-run.

begin;

-- The one business this instance keeps books for.
insert into businesses (slug, name, entity_type, tax_treatment, state, fiscal_year_start, formation_date)
values ('passagelab', 'PassageLab, LLC', 'smllc', 'schedule_c', 'OK', '2026-01-01', '2026-01-01')
on conflict (slug) do nothing;

-- Seed chart of accounts.
with b as (select id from businesses where slug = 'passagelab')
insert into accounts (business_id, code, name, type, subtype, tax_line_mapping, is_contra)
select b.id, v.code, v.name, v.type::account_type, v.subtype, v.tax_line, v.is_contra
from b, (values
  -- Income
  ('4000','Subscription Revenue — Practical ($5)',        'income','revenue','Schedule C Line 1 — Gross receipts', false),
  ('4010','Subscription Revenue — Scholarly Depth ($10)', 'income','revenue','Schedule C Line 1 — Gross receipts', false),
  ('4020','Subscription Revenue — Academic ($20)',        'income','revenue','Schedule C Line 1 — Gross receipts', false),
  ('4900','Refunds & Chargebacks',                        'income','contra_revenue','Schedule C Line 2 — Returns & allowances', true),

  -- Expenses (Schedule C line in mapping)
  ('5000','Merchant Processing Fees — Stripe','expense','fees','Schedule C Line 10 — Commissions & fees', false),
  ('5100','Software & Subscriptions',          'expense','software','Schedule C Line 27a — Other expenses', false),
  ('5110','AI/API Usage — Anthropic',          'expense','cogs','Schedule C Line 27a — Other expenses', false),
  ('5120','Audio Generation — ElevenLabs',     'expense','cogs','Schedule C Line 27a — Other expenses', false),
  ('5200','Advertising & Marketing',           'expense','advertising','Schedule C Line 8 — Advertising', false),
  ('5300','Legal & Professional',              'expense','professional','Schedule C Line 17 — Legal & professional', false),
  ('5400','Office Expense',                     'expense','office','Schedule C Line 18 — Office expense', false),
  ('5500','Business Insurance',                 'expense','insurance','Schedule C Line 15 — Insurance', false),
  ('5600','Bank & Service Charges',            'expense','fees','Schedule C Line 27a — Other expenses', false),
  ('5700','Education & Research Materials',     'expense','research','Schedule C Line 27a — Other expenses', false),
  ('5800','Home Office',                        'expense','home_office','Schedule C Line 30 — Home office (8829)', false),
  ('5900','Equipment & Depreciation',          'expense','depreciation','Schedule C Line 13 — Depreciation', false),

  -- Assets
  ('1000','Business Checking',                  'asset','bank','Balance Sheet', false),
  ('1010','Stripe Balance',                     'asset','bank','Balance Sheet', false),
  ('1500','Equipment (at cost)',                'asset','fixed','Balance Sheet', false),
  ('1600','Accumulated Depreciation',           'asset','contra_fixed','Balance Sheet', true),

  -- Liabilities
  ('2000','Business Credit Card',               'liability','credit_card','Balance Sheet', false),
  ('2100','Sales Tax Payable',                  'liability','tax','Balance Sheet', false),

  -- Equity
  ('3000','Owner Contributions',                'equity','contributions','Schedule C — Owner basis', false),
  ('3100','Owner Draws',                        'equity','draws','Schedule C — Owner basis', false),
  ('3900','Retained Earnings',                  'equity','retained','Balance Sheet', false)
) as v(code, name, type, subtype, tax_line, is_contra)
on conflict (business_id, code) do nothing;

-- Default tax config for the current year. verified_by_cpa stays false until confirmed.
with b as (select id from businesses where slug = 'passagelab')
insert into tax_config (business_id, year, home_office_sqft, home_total_sqft, vehicle_method,
                        se_tax_applicable, filing_status, verified_by_cpa)
select b.id, extract(year from current_date)::int, null, null, 'standard_mileage', true, 'single', false
from b
on conflict (business_id, year) do nothing;

commit;
