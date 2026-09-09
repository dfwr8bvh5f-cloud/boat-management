"use client";

import { Paperclip } from "lucide-react";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { formatDateDisplay } from "@/lib/date-format";
import { getPaymentLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ApprovalStatus, PaymentMethod } from "@/lib/types/database";

export type PlanPaymentSummary = {
  id: string;
  amount: number;
  expense_date: string | null;
  payment_method: PaymentMethod | null;
  status: ApprovalStatus;
  // Signed URL for the payment's own proof-of-payment file, when it has
  // one - omitted (or null) simply hides the view icon for that row.
  receiptUrl?: string | null;
};

// Read-only "€X on DATE via METHOD" list for one payment plan - used for a
// finished plan's small detail in the main expenses list, the in-progress
// list, and the approval card's read-only view (never editable there).
export function ExpensePaymentPlanBreakdown({
  payments,
  locale,
}: {
  payments: PlanPaymentSummary[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const paymentLabels = getPaymentLabels(locale);

  if (payments.length === 0) {
    return <p className="text-xs text-fleet-ink">{t("no_payments_yet")}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {payments.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2 text-fleet-navy">
            <span className="font-bold">€{p.amount.toLocaleString("he-IL")}</span>
            <span className="text-fleet-ink">{formatDateDisplay(p.expense_date)}</span>
            <span className="text-fleet-ink">
              {p.payment_method ? paymentLabels[p.payment_method] : t("not_set_yet")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {p.receiptUrl && (
              <a
                href={p.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("proof_of_payment")}
                title={t("proof_of_payment")}
                className="text-fleet-ink hover:text-fleet-teal"
              >
                <Paperclip size={14} />
              </a>
            )}
            <ApprovalIndicator value={p.status} locale={locale} />
          </div>
        </div>
      ))}
    </div>
  );
}
