import Link from "next/link";
import { Ship } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { TabLink } from "@/components/tab-link";

const OPERATIONAL_TABS = [
  { href: "", label: "סקירה" },
  { href: "/maintenance", label: "תחזוקה" },
  { href: "/finance", label: "כספים" },
  { href: "/bookings", label: "יומן" },
  { href: "/documents", label: "מסמכים" },
  { href: "/reports", label: "דוחות" },
  { href: "/staff", label: "צוות" },
  { href: "/store", label: "הכנות להפלגה" },
] as const;

// A boat marked for sale doesn't need day-to-day operational tabs - it gets
// a trimmed nav plus the sale Catalog tab instead.
const FOR_SALE_TABS = [
  { href: "", label: "סקירה" },
  { href: "/finance", label: "כספים" },
  { href: "/documents", label: "מסמכים" },
  { href: "/catalog", label: "קטלוג" },
] as const;

export default async function BoatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { boat } = await getBoatContext(id);
  const tabs = boat.boat_type === "for_sale" ? FOR_SALE_TABS : OPERATIONAL_TABS;

  let logoUrl: string | null = null;
  if (boat.logo_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Ship size={17} className="text-fleet-brass" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-fleet-navy">{boat.name}</h1>
          <StatusBadge value={boat.status} />
        </div>
        <Link href="/boats" className="text-sm font-medium text-fleet-brass hover:underline">
          ← כל הסירות
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-fleet-border print:hidden">
        {tabs.map((tab) => (
          <TabLink
            key={tab.href}
            href={`/boats/${boat.id}${tab.href}`}
            label={tab.label}
            exact={tab.href === ""}
          />
        ))}
      </nav>

      {children}
    </div>
  );
}
