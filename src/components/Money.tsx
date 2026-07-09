import { formatAccounting, formatCents } from "@/lib/money";

/** Right-aligned money cell. Negative rendered red, in accounting parentheses. */
export function Money({
  cents,
  accounting = false,
  className = "",
}: {
  cents: number;
  accounting?: boolean;
  className?: string;
}) {
  const value = Number(cents);
  const text = accounting ? formatAccounting(value) : formatCents(value);
  const tone = value < 0 ? "text-ledger-red" : "";
  return <span className={`num ${tone} ${className}`}>{text}</span>;
}
