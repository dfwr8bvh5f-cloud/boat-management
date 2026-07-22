import Link from "next/link";
import { Landmark, Banknote } from "lucide-react";
import { getCachedBoatFinancialSummary } from "@/lib/boat-financial-summary";
import { getTranslator } from "@/lib/i18n/locale";
import { formatCurrency } from "@/lib/money";

// Split out of the dashboard page's main render so its own Suspense
// boundary can stream in after the rest of the page (which doesn't depend
// on the full-history balance scan) has already painted.
export async function BoatBalanceCards({ boatId }: { boatId: string }) {
  const { t } = await getTranslator();
  const { bankBalance, cashNet } = await getCachedBoatFinancialSummary(boatId);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href={`/boats/${boatId}/finance/bank`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
        <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
          <Landmark size={14} /> {t("bank_balance")}
        </div>
        <div className={`mt-1 text-lg font-bold ${bankBalance < 5000 ? "text-fleet-coral-text" : "text-fleet-navy"}`}>
          {formatCurrency(bankBalance)}
        </div>
        {bankBalance < 5000 && <div className="mt-0.5 text-2xs text-fleet-coral-text">{t("bank_low_balance")}</div>}
      </Link>
      <Link href={`/boats/${boatId}/finance/cash`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
        <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
          <Banknote size={14} /> {t("cash_balance")}
        </div>
        <div className={`mt-1 text-lg font-bold ${cashNet >= 0 ? "text-fleet-navy" : "text-fleet-coral-text"}`}>
          {formatCurrency(cashNet)}
        </div>
      </Link>
    </div>
  );
}
