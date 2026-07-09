import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LedgerOne",
  description: "Personal accounting + tax platform for PassageLab, LLC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
