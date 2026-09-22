import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { TabLink } from "@/components/tab-link";
import { getTranslator } from "@/lib/i18n/locale";

// Same persistent-tabs pattern a single boat's own pages use
// (boats/[id]/layout.tsx) - the nav used to live only on /mys/page.tsx
// itself, so switching from e.g. /mys/debts to /mys/invoices meant going
// back to the dashboard first instead of jumping tab to tab directly.
export default async function MysLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t } = await getTranslator();

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex w-full border-b border-fleet-border print:hidden">
        <TabLink href="/mys/expenses" label={t("mys_nav_expenses")} icon="expenses" />
        <TabLink href="/mys/income" label={t("mys_nav_income")} icon="income" />
        <TabLink href="/mys/debts" label={t("mys_nav_debts")} icon="debts" />
        <TabLink href="/mys/invoices" label={t("mys_nav_invoices")} icon="invoices" />
        <TabLink href="/mys/bank-reconciliation" label={t("mys_nav_bank_reconciliation")} icon="bankReconciliation" />
        <TabLink href="/mys/commissions" label={t("mys_nav_commissions")} icon="commissions" />
        <TabLink href="/mys/clients" label={t("mys_nav_clients")} icon="clients" />
      </nav>
      {children}
    </div>
  );
}
