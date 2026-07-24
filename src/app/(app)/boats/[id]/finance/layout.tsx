import { getBoatContext } from "@/lib/boat-access";
import { SegLink } from "@/components/seg-link";
import { getTranslator } from "@/lib/i18n/locale";

export default async function FinanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const { t } = await getTranslator();

  const SUB_TABS = [
    { href: "/finance/expenses", label: t("sub_expenses") },
    { href: "/finance/bank", label: t("sub_bank") },
    { href: "/finance/cash", label: t("sub_cash") },
    { href: "/finance/invoices", label: t("sub_invoices") },
    { href: "/finance/future", label: t("sub_future") },
    { href: "/finance/report", label: t("sub_report") },
    { href: "/finance/budget", label: t("sub_budget") },
    { href: "/finance/bank-reconciliation", label: t("sub_bank_reconciliation"), managementOnly: true },
  ];
  const tabs = SUB_TABS.filter((tab) => tab.href !== "/finance/future" || boat.boat_type !== "private").filter(
    (tab) => !tab.managementOnly || profile.role === "management"
  );

  return (
    <div className="flex flex-col gap-4">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm text-fleet-ink print:hidden">
          {t("owner_view_only")}
        </p>
      )}
      <div className="flex snap-x gap-1 overflow-x-auto rounded-xl bg-fleet-tabs p-1 print:hidden">
        {tabs.map((tab) => (
          <SegLink key={tab.href} href={`/boats/${id}${tab.href}`} label={tab.label} />
        ))}
      </div>
      {children}
    </div>
  );
}
