// LedgerOne — Tax constants
//
// ⚠️ STANDING RULE (README Section 2): LedgerOne computes and organizes. It does
// not give tax advice. These constants are best-effort published figures and MUST
// be verified with a CPA before any figure is relied upon. Every tax-affecting
// number surfaces a "verify with CPA" warning in the UI until confirmed.
//
// Figures are year-keyed so updating for a new year is a data change, not a
// code change. Amounts are in CENTS where they represent money.

export interface FederalBracket {
  upToCents: number | null; // null = no upper bound
  rate: number;
}

export interface YearTaxParams {
  year: number;
  // Self-employment tax
  seNetEarningsFactor: number; // 0.9235
  socialSecurityWageBaseCents: number;
  socialSecurityRate: number; // 0.124 (employer+employee)
  medicareRate: number; // 0.029
  additionalMedicareRate: number; // 0.009
  additionalMedicareThresholdCents: number; // by filing status (single)
  // Federal income tax (single filer)
  federalStandardDeductionCents: number;
  federalBrackets: FederalBracket[];
  qbiRate: number; // 0.20 Qualified Business Income deduction (simplified)
  // Oklahoma income tax (single filer)
  okStandardDeductionCents: number;
  okBrackets: FederalBracket[];
}

// 2025 figures (single filer). Verify with CPA / IRS Pub before filing.
const PARAMS_2025: YearTaxParams = {
  year: 2025,
  seNetEarningsFactor: 0.9235,
  socialSecurityWageBaseCents: 176_100_00,
  socialSecurityRate: 0.124,
  medicareRate: 0.029,
  additionalMedicareRate: 0.009,
  additionalMedicareThresholdCents: 200_000_00,
  federalStandardDeductionCents: 15_000_00,
  federalBrackets: [
    { upToCents: 11_925_00, rate: 0.10 },
    { upToCents: 48_475_00, rate: 0.12 },
    { upToCents: 103_350_00, rate: 0.22 },
    { upToCents: 197_300_00, rate: 0.24 },
    { upToCents: 250_525_00, rate: 0.32 },
    { upToCents: 626_350_00, rate: 0.35 },
    { upToCents: null, rate: 0.37 },
  ],
  qbiRate: 0.20,
  // Oklahoma 2025 single-filer brackets (top marginal 4.75%).
  okStandardDeductionCents: 6_350_00,
  okBrackets: [
    { upToCents: 1_000_00, rate: 0.0025 },
    { upToCents: 2_500_00, rate: 0.0075 },
    { upToCents: 3_750_00, rate: 0.0175 },
    { upToCents: 4_900_00, rate: 0.0275 },
    { upToCents: 7_200_00, rate: 0.0375 },
    { upToCents: null, rate: 0.0475 },
  ],
};

// 2026 placeholder — mirrors 2025 until official figures are published & CPA-verified.
const PARAMS_2026: YearTaxParams = { ...PARAMS_2025, year: 2026 };

const TABLE: Record<number, YearTaxParams> = {
  2025: PARAMS_2025,
  2026: PARAMS_2026,
};

export function taxParamsForYear(year: number): YearTaxParams {
  return TABLE[year] ?? { ...PARAMS_2025, year };
}

// Quarterly estimated-tax due dates (federal 1040-ES). Q4 falls in Jan of next year.
export function quarterlyDueDates(year: number): { quarter: number; due: string }[] {
  return [
    { quarter: 1, due: `${year}-04-15` },
    { quarter: 2, due: `${year}-06-15` },
    { quarter: 3, due: `${year}-09-15` },
    { quarter: 4, due: `${year + 1}-01-15` },
  ];
}
