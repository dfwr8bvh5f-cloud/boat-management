import Link from "next/link";
import { getBoatContext } from "@/lib/boat-access";
import { StatusBadge } from "@/components/status-badge";
import { TabLink } from "@/components/tab-link";

const TABS = [
  { href: "", label: "סקירה" },
  { href: "/maintenance", label: "תחזוקה" },
  { href: "/bookings", label: "הזמנות" },
  { href: "/finance", label: "כספים" },
  { href: "/staff", label: "צוות" },
  { href: "/documents", label: "מסמכים" },
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{boat.name}</h1>
          <StatusBadge value={boat.status} />
        </div>
        <Link href="/boats" className="text-sm font-medium text-teal-700 hover:underline">
          ← כל הסירות
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
        {TABS.map((tab) => (
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
