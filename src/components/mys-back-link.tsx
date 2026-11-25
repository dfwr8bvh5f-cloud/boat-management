import { BackLink } from "@/components/back-link";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// A small back-to-dashboard link shown at the top of every /mys/* subpage
// (debts, expenses, income, invoices, clients, commissions, bank
// reconciliation) - not on /mys itself, since a link back to the page
// you're already on is pointless. Uses the shared BackLink so every "back"
// in the app looks and mirrors the same way.
export function MysBackLink({ locale }: { locale: Locale }) {
  return <BackLink href="/mys" label={translate(locale, "back_to_mys")} />;
}
