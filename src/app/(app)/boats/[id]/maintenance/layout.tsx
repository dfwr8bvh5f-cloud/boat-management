import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MaintenanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getBoatContext(id);
  const { t } = await getTranslator();

  const SUB_TABS = [
    { href: "/maintenance/issues", label: t("tech_issues") },
    { href: "/maintenance/specs", label: t("tech_specs") },
    { href: "/maintenance/reports", label: t("nav_reports") },
  ];

  return (
    <div className="flex flex-col gap-4">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm text-fleet-ink">
          {t("owner_view_only_issues")}
        </p>
      )}
      <div className="flex justify-center gap-1 rounded-xl bg-fleet-tabs p-1">
        {SUB_TABS.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
