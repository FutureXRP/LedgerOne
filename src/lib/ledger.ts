// LedgerOne — Ledger posting primitives.
//
// A bank/card transaction is one signed amount (positive = money in). It posts
// as a balanced two-legged entry: the bank/clearing leg and the category leg.
// The DB zero-sum trigger is the backstop; this builds legs that already balance.
//
// Sign convention (matches the reporting views):
//   asset/expense are debit-normal  (increase = positive amount_cents)
//   income/liability/equity are credit-normal (increase = negative amount_cents)
// So for a bank amount `amt`: bank leg = amt, category leg = -amt. Always sums to 0.

export interface LegSpec {
  account_id: string;
  amount_cents: number;
  memo?: string;
}

/** Build the two legs of a simple bank transaction. */
export function buildBankLegs(params: {
  bankAccountId: string;
  categoryAccountId: string;
  amountCents: number; // signed, positive = money in
  memo?: string;
}): LegSpec[] {
  const { bankAccountId, categoryAccountId, amountCents, memo } = params;
  return [
    { account_id: bankAccountId, amount_cents: amountCents, memo },
    { account_id: categoryAccountId, amount_cents: -amountCents, memo },
  ];
}

/** Build legs for a manual multi-line journal entry, validating zero-sum here too. */
export function buildJournalLegs(legs: LegSpec[]): LegSpec[] {
  const total = legs.reduce((s, l) => s + Math.trunc(l.amount_cents), 0);
  if (total !== 0) {
    throw new Error(`Journal entry does not balance: legs sum to ${total} cents, must be 0.`);
  }
  if (legs.length < 2) {
    throw new Error("A journal entry needs at least two legs.");
  }
  return legs;
}
