import { Nav } from "@/components/Nav";
import { getBusiness } from "@/lib/data";
import { ConfigNotice } from "@/components/ConfigNotice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const business = configured ? await getBusiness() : null;

  return (
    <div className="flex min-h-screen">
      <Nav businessName={business?.name ?? "PassageLab, LLC"} />
      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {!configured && <ConfigNotice />}
          {children}
        </div>
      </main>
    </div>
  );
}
