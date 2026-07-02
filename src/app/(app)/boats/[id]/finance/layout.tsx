import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";

const SUB_TABS = [
  { href: "/finance/expenses", label: "הוצאות" },
  { href: "/finance/bank", label: "בנק" },
  { href: "/finance/cash", label: "מזומן" },
  { href: "/finance/invoices", label: "חשבוניות" },
  { href: "/finance/future", label: "הכנסות עתידיות" },
  { href: "/finance/report", label: "דוח תקופתי" },
  { href: "/finance/budget", label: "תקציב" },
] as const;

export default async function FinanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getBoatContext(id);

  return (
    <div className="flex flex-col gap-4">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm text-fleet-ink">
          צפייה בלבד — מוצג מידע פיננסי שאושר על ידי הניהול.
        </p>
      )}
      <div className="flex flex-wrap gap-1 rounded-xl bg-[#EAEDF2] p-1">
        {SUB_TABS.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
