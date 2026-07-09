// LedgerOne — Money utilities
//
// Iron Rule (README Section 4): all math in integer CENTS, never floats.
// This module is the only place allowed to bridge cents <-> display strings.
// Nothing here rounds money in a way that loses cents.

/** Parse a human-typed dollar string ("1,234.56", "$40", "-12.5") to integer cents. */
export function dollarsToCents(input: string | number): number {
  if (typeof input === "number") {
    // Guard against float drift: round to nearest cent.
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  // Negative can be signalled either by accounting parentheses or a leading minus.
  const parenNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const core = parenNegative ? cleaned.slice(1, -1) : cleaned;
  const value = Number(core);
  if (Number.isNaN(value)) {
    throw new Error(`Not a valid money amount: "${input}"`);
  }
  const negative = parenNegative || value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  return negative ? -cents : cents;
}

/** Format integer cents as a plain dollar string, e.g. 123456 -> "1,234.56". */
export function formatCents(cents: number, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const { sign = false, symbol = true } = opts;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  const body = `${grouped}.${rem.toString().padStart(2, "0")}`;
  const prefix = symbol ? "$" : "";
  if (negative) return `-${prefix}${body}`;
  if (sign) return `+${prefix}${body}`;
  return `${prefix}${body}`;
}

/** Accounting-style: negatives in parentheses. 123456 -> "$1,234.56"; -5000 -> "($50.00)". */
export function formatAccounting(cents: number): string {
  if (cents < 0) return `(${formatCents(-cents)})`;
  return formatCents(cents);
}

/** Sum a list of cent amounts. Kept explicit so we never Array.reduce floats by accident. */
export function sumCents(values: number[]): number {
  let total = 0;
  for (const v of values) total += Math.trunc(v);
  return total;
}

/** Basis points of a cent amount, rounded to nearest cent. e.g. rate 0.153 (15.3%). */
export function applyRate(cents: number, rate: number): number {
  return Math.round(cents * rate);
}
