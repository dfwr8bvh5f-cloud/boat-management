import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export type MysBilling = { state: "open" } | { state: "invoiced"; invoiceNumber: string | null } | { state: "paid" };

// Where a management-paid, billed-to-MYS expense stands on the MYS side
// (open debt -> invoiced -> paid), shown right on the boat's own expense
// row. Before this the row stayed a plain "approved" after MYS invoiced or
// collected it, so the only way to learn whether it had been reimbursed was
// to open /mys and search. Brass = still open, navy = invoiced, moss = paid.
const CLASS_BY_STATE = {
  open: "bg-fleet-brass/15 text-fleet-brass",
  invoiced: "bg-fleet-navy/10 text-fleet-navy",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
} as const;

export function MysBillingChip({ billing, locale }: { billing: MysBilling; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const label =
    billing.state === "open"
      ? t("mys_billing_open")
      : billing.state === "paid"
        ? t("mys_billing_paid")
        : `${t("mys_billing_invoiced")}${billing.invoiceNumber ? ` ${billing.invoiceNumber}` : ""}`;
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-3xs font-bold ${CLASS_BY_STATE[billing.state]}`}>{label}</span>
  );
}
