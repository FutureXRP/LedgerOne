import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/import", label: "Import CSV" },
  { href: "/transactions", label: "Review Queue" },
  { href: "/ledger", label: "Ledger" },
  { href: "/reports/pnl", label: "P&L" },
  { href: "/reports/balance-sheet", label: "Balance Sheet" },
  { href: "/reports/close", label: "Monthly Close" },
  { href: "/tax", label: "Tax" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ businessName }: { businessName: string }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <div className="text-lg font-bold tracking-tight">LedgerOne</div>
        <div className="mt-0.5 text-xs text-ink-faint">{businessName}</div>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper hover:text-ink"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <SignOutButton />
      </div>
    </aside>
  );
}
