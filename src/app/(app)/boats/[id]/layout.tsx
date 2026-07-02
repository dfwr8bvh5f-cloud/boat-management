import Link from "next/link";
import { Ship } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { TabLink } from "@/components/tab-link";
import { getTranslator } from "@/lib/i18n/locale";

export default async function BoatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { boat } = await getBoatContext(id);
  const { t, locale } = await getTranslator();

  const OPERATIONAL_TABS = [
    { href: "", label: t("nav_overview"), icon: "overview" as const },
    { href: "/maintenance", label: t("nav_maintenance"), icon: "maintenance" as const },
    { href: "/finance", label: t("nav_finance"), icon: "finance" as const },
    { href: "/bookings", label: t("nav_bookings"), icon: "bookings" as const },
    { href: "/documents", label: t("nav_documents"), icon: "documents" as const },
    { href: "/reports", label: t("nav_reports"), icon: "reports" as const },
    { href: "/staff", label: t("nav_staff"), icon: "staff" as const },
    { href: "/store", label: t("nav_store"), icon: "store" as const },
  ];

  // A boat marked for sale doesn't need day-to-day operational tabs - it gets
  // a trimmed nav plus the sale Catalog tab instead.
  const FOR_SALE_TABS = [
    { href: "", label: t("nav_overview"), icon: "overview" as const },
    { href: "/finance", label: t("nav_finance"), icon: "finance" as const },
    { href: "/documents", label: t("nav_documents"), icon: "documents" as const },
    { href: "/catalog", label: t("nav_catalog"), icon: "catalog" as const },
  ];

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
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Ship size={17} className="text-fleet-brass" />
            )}
          </div>
          <div className="h-8 w-px shrink-0 bg-fleet-border" />
          <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{boat.name}</h1>
          <StatusBadge value={boat.status} locale={locale} />
        </div>
        <Link href="/boats" className="text-sm font-medium text-fleet-brass hover:underline">
          ← {t("nav_all_boats")}
        </Link>
      </div>

      <nav className="flex w-full border-b border-fleet-border print:hidden">
        {tabs.map((tab) => (
          <TabLink
            key={tab.href}
            href={`/boats/${boat.id}${tab.href}`}
            label={tab.label}
            icon={tab.icon}
            exact={tab.href === ""}
          />
        ))}
      </nav>

      {children}
    </div>
  );
}
