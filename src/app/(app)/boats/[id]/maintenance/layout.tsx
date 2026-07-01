import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";

const SUB_TABS = [
  { href: "/maintenance/issues", label: "תקלות ומשימות" },
  { href: "/maintenance/safety", label: "ציוד בטיחות" },
] as const;

export default async function MaintenanceLayout({
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
          צפייה בלבד — מוצגות תקלות שאושרו על ידי הניהול.
        </p>
      )}
      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {SUB_TABS.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
