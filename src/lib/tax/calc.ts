// LedgerOne — Deterministic tax calculations (all cents).
//
// These are ESTIMATES to size quarterly payments and year-end position. They are
// not a filed return and not tax advice. Each result carries the assumptions used
// so the UI can show its work — every number is reproducible by hand.

import { applyRate } from "@/lib/money";
import {
  taxParamsForYear,
  quarterlyDueDates,
  type FederalBracket,
  type YearTaxParams,
} from "./constants";

/** Apply a progressive bracket table to a taxable-income base (cents). */
export function applyBrackets(baseCents: number, brackets: FederalBracket[]): number {
  if (baseCents <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upToCents ?? Infinity;
    if (baseCents > lower) {
      const slice = Math.min(baseCents, upper) - lower;
      tax += applyRate(slice, b.rate);
    }
    lower = upper;
    if (baseCents <= upper) break;
  }
  return tax;
}

export interface SeTaxResult {
  netProfitCents: number;
  netEarningsCents: number; // net profit * 0.9235
  socialSecurityCents: number;
  medicareCents: number;
  additionalMedicareCents: number;
  totalSeTaxCents: number;
  halfDeductibleCents: number; // deductible above-the-line for income tax
}

/** Schedule SE. Half of SE tax is deductible against income tax. */
export function computeSeTax(netProfitCents: number, p: YearTaxParams): SeTaxResult {
  const zero: SeTaxResult = {
    netProfitCents,
    netEarningsCents: 0,
    socialSecurityCents: 0,
    medicareCents: 0,
    additionalMedicareCents: 0,
    totalSeTaxCents: 0,
    halfDeductibleCents: 0,
  };
  if (netProfitCents <= 0) return zero;

  const netEarnings = applyRate(netProfitCents, p.seNetEarningsFactor);
  // SE tax floor: below ~$400 net earnings, no SE tax.
  if (netEarnings < 400_00) return zero;

  const ssBase = Math.min(netEarnings, p.socialSecurityWageBaseCents);
  const socialSecurity = applyRate(ssBase, p.socialSecurityRate);
  const medicare = applyRate(netEarnings, p.medicareRate);
  const addlBase = Math.max(0, netEarnings - p.additionalMedicareThresholdCents);
  const additionalMedicare = applyRate(addlBase, p.additionalMedicareRate);

  const total = socialSecurity + medicare + additionalMedicare;
  return {
    netProfitCents,
    netEarningsCents: netEarnings,
    socialSecurityCents: socialSecurity,
    medicareCents: medicare,
    additionalMedicareCents: additionalMedicare,
    totalSeTaxCents: total,
    halfDeductibleCents: Math.round(total / 2),
  };
}

export interface TaxPosition {
  year: number;
  netProfitCents: number;
  se: SeTaxResult;
  qbiDeductionCents: number;
  federalTaxableCents: number;
  federalIncomeTaxCents: number;
  okTaxableCents: number;
  okIncomeTaxCents: number;
  totalFederalCents: number; // income tax + SE tax
  totalOkCents: number;
  grandTotalCents: number;
  assumptions: string[];
}

/**
 * Full estimated tax position from business net profit.
 * Simplifying assumptions (single filer, business is the only income) are
 * listed in `assumptions` and shown in the UI. Verify with CPA.
 */
export function computeTaxPosition(netProfitCents: number, year: number): TaxPosition {
  const p = taxParamsForYear(year);
  const se = computeSeTax(netProfitCents, p);

  // Qualified Business Income deduction, simplified to 20% of net profit
  // reduced by the deductible half of SE tax. Real QBI has income-based
  // phaseouts and W-2/UBIA limits — flagged as an assumption.
  const qbiBase = Math.max(0, netProfitCents - se.halfDeductibleCents);
  const qbiDeduction = applyRate(qbiBase, p.qbiRate);

  // Federal taxable income = net profit - 1/2 SE tax - standard deduction - QBI.
  const federalTaxable = Math.max(
    0,
    netProfitCents - se.halfDeductibleCents - p.federalStandardDeductionCents - qbiDeduction
  );
  const federalIncomeTax = applyBrackets(federalTaxable, p.federalBrackets);

  // Oklahoma taxable income = net profit - 1/2 SE tax - OK standard deduction.
  // OK does not allow the federal QBI deduction against state tax.
  const okTaxable = Math.max(
    0,
    netProfitCents - se.halfDeductibleCents - p.okStandardDeductionCents
  );
  const okIncomeTax = applyBrackets(okTaxable, p.okBrackets);

  const totalFederal = federalIncomeTax + se.totalSeTaxCents;
  return {
    year,
    netProfitCents,
    se,
    qbiDeductionCents: qbiDeduction,
    federalTaxableCents: federalTaxable,
    federalIncomeTaxCents: federalIncomeTax,
    okTaxableCents: okTaxable,
    okIncomeTaxCents: okIncomeTax,
    totalFederalCents: totalFederal,
    totalOkCents: okIncomeTax,
    grandTotalCents: totalFederal + okIncomeTax,
    assumptions: [
      "Filing status: single.",
      "Business net profit is the only source of income.",
      `QBI deduction estimated as ${Math.round(p.qbiRate * 100)}% with no phaseout applied.`,
      "Standard deduction used (no itemizing).",
      "No credits, withholding, or other adjustments applied.",
      "Estimate only — verify with CPA before paying or filing.",
    ],
  };
}

export interface QuarterlyEstimate {
  year: number;
  annualFederalCents: number;
  annualOkCents: number;
  safeHarborBasis: "current_90" | "prior_year";
  safeHarborNoteFederal: string;
  perQuarter: { quarter: number; due: string; federalCents: number; okCents: number }[];
}

/**
 * Quarterly estimated payments with safe-harbor logic.
 *
 * Federal safe harbor: pay the SMALLER of
 *   (a) 90% of current-year total tax, or
 *   (b) 100% of prior-year tax (110% if prior-year AGI > $150k).
 * We annualize the projection then split into four equal installments.
 */
export function computeQuarterlyEstimates(
  position: TaxPosition,
  opts: {
    priorYearTaxCents?: number | null;
    priorYearAgiCents?: number | null;
  }
): QuarterlyEstimate {
  const { priorYearTaxCents, priorYearAgiCents } = opts;

  const current90 = applyRate(position.totalFederalCents, 0.9);

  let federalTarget = current90;
  let basis: QuarterlyEstimate["safeHarborBasis"] = "current_90";
  let note = "90% of projected current-year federal tax.";

  if (priorYearTaxCents && priorYearTaxCents > 0) {
    const highIncome = (priorYearAgiCents ?? 0) > 150_000_00;
    const priorPct = highIncome ? 1.1 : 1.0;
    const priorHarbor = applyRate(priorYearTaxCents, priorPct);
    if (priorHarbor < current90) {
      federalTarget = priorHarbor;
      basis = "prior_year";
      note = `${Math.round(priorPct * 100)}% of prior-year federal tax (safe harbor, lower than 90% current).`;
    }
  }

  // Oklahoma: 70% current-year safe harbor is common; use the lower of 70%
  // current or the full projection to be conservative.
  const okTarget = applyRate(position.totalOkCents, 0.7);

  const dues = quarterlyDueDates(position.year);
  const fedQ = Math.round(federalTarget / 4);
  const okQ = Math.round(okTarget / 4);

  return {
    year: position.year,
    annualFederalCents: federalTarget,
    annualOkCents: okTarget,
    safeHarborBasis: basis,
    safeHarborNoteFederal: note,
    perQuarter: dues.map((d, i) => ({
      quarter: d.quarter,
      due: d.due,
      // Put rounding remainder in Q4 so four installments sum exactly to target.
      federalCents: i === 3 ? federalTarget - fedQ * 3 : fedQ,
      okCents: i === 3 ? okTarget - okQ * 3 : okQ,
    })),
  };
}
