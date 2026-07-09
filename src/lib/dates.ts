// LedgerOne — Date range helpers (server-safe, no locale surprises).

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function ytdRange(asOf: string = isoToday()): { from: string; to: string } {
  const year = asOf.slice(0, 4);
  return { from: `${year}-01-01`, to: asOf };
}

export function monthRange(year: number, month1to12: number): { from: string; to: string } {
  const mm = String(month1to12).padStart(2, "0");
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function quarterRange(year: number, q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = (q - 1) * 3 + 1;
  const from = monthRange(year, startMonth).from;
  const to = monthRange(year, startMonth + 2).to;
  return { from, to };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month1to12: number): string {
  return MONTHS[month1to12 - 1] ?? "";
}

/** Format an ISO date for display, e.g. "2026-07-09" -> "Jul 9, 2026". */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]?.slice(0, 3)} ${d}, ${y}`;
}
