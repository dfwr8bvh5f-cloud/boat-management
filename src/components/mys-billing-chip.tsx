import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export type MysBilling = { state: "open" } | { state: "invoiced"; invoiceNumber: string | null } | { state: "paid" };

// Where a management-paid, billed-to-MYS expense stands on the MYS side,
// shown next to the MYS logo on the boat's own expense row. Only an unpaid
// debt gets a mark: "Open debt" in neutral blue-grey - an invoiced-but-unpaid
// charge is still an open debt, its invoice number is in the tooltip. Once
// the debt is paid nothing is drawn here at all (the row instead gets a plain
// "Paid by MYS" text line, see expenses-manager.tsx), so a settled charge
// stops drawing the eye.
export function MysBillingChip({ billing, locale }: { billing: MysBilling; locale: Locale }) {
  if (billing.state === "paid") return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const title =
    billing.state === "invoiced" ? `${t("mys_billing_invoiced")}${billing.invoiceNumber ? ` ${billing.invoiceNumber}` : ""}` : undefined;
  return (
    <span
      title={title}
      className="shrink-0 whitespace-nowrap rounded-full bg-fleet-navy/10 px-1.5 py-0.5 text-3xs font-bold text-fleet-navy"
    >
      {t("mys_billing_open")}
    </span>
  );
}
