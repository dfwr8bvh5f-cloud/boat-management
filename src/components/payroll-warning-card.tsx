import { Wallet } from "lucide-react";
import { getCachedBoatFinancialSummary } from "@/lib/boat-financial-summary";
import { getTranslator } from "@/lib/i18n/locale";
import { formatCurrency } from "@/lib/money";

// Needs bankBalance too (same full-history scan as BoatBalanceCards) - see
// getCachedBoatFinancialSummary for why that isn't computed twice.
export async function PayrollWarningCard({ boatId, totalMonthlySalaries }: { boatId: string; totalMonthlySalaries: number }) {
  const { t } = await getTranslator();
  const { bankBalance } = await getCachedBoatFinancialSummary(boatId);
  const payrollShortfall = totalMonthlySalaries - bankBalance;
  const showPayrollWarning = new Date().getDate() >= 20 && totalMonthlySalaries > 0 && payrollShortfall > 0;

  if (!showPayrollWarning) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-fleet-coral bg-fleet-coral/10 p-4">
      <Wallet size={16} className="text-fleet-coral-text" />
      <div>
        <div className="text-sm font-bold text-fleet-coral-text">{t("payroll_warning_title")}</div>
        <div className="mt-0.5 text-xs text-fleet-ink">
          {t("payroll_warning_body", { amount: formatCurrency(payrollShortfall) })}
        </div>
      </div>
    </div>
  );
}
