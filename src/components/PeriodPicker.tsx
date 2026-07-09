"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PRESETS = [
  { key: "ytd", label: "YTD" },
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" },
  { key: "year", label: "Full year" },
];

export function PeriodPicker({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("preset") ?? "ytd";

  return (
    <div className="flex flex-wrap gap-1">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => router.push(`${basePath}?preset=${p.key}`)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            active === p.key ? "bg-ink text-white" : "border border-line bg-white text-ink-soft"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
