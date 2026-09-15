import Link from "next/link";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// A small back-to-dashboard link shown at the top of every /mys/* subpage
// (debts, expenses, income, invoices, clients, commissions, bank
// reconciliation) - not on /mys itself, since a link back to the page
// you're already on is pointless. Mirrors the same "← back to X" pattern
// already used on the invoice document page (back_to_invoices).
export function MysBackLink({ locale }: { locale: Locale }) {
  return (
    <Link href="/mys" className="inline-block text-sm font-medium text-fleet-teal hover:underline">
      ← {translate(locale, "back_to_mys")}
    </Link>
  );
}
