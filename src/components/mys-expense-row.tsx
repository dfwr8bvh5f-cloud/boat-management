"use client";

import { AlertTriangle, ArrowLeftRight, CheckCircle2, Clock, Pencil, ReceiptEuro, Trash2 } from "lucide-react";
import { AttachmentGroup } from "@/components/attachment-group";
import { Button } from "@/components/ui/button";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import type { translate } from "@/lib/i18n/translate";
import type { MysExpenseCategory, PaymentMethod } from "@/lib/types/database";
import type { MysExpenseReconciliationFlag } from "@/components/mys-bank-reconciliation-manager";
import type { MysExpenseWithUrl } from "@/components/mys-expenses-manager";

// One row of the MYS fleet-wide expenses list (mys-expenses-manager.tsx) -
// pulled out unchanged, just parameterized, so the list can hand rows to
// react-virtuoso instead of mapping+slicing them all into the DOM at once.
export function MysExpenseRow({
  e,
  flag,
  t,
  categoryLabels,
  subcategoryLabels,
  paymentLabels,
  reconciliationFlagLabels,
  applyingDateId,
  applySuggestedDate,
  startEdit,
  deletingId,
  setPendingDelete,
  isDraft = false,
}: {
  e: MysExpenseWithUrl;
  flag: MysExpenseReconciliationFlag | undefined;
  t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => string;
  categoryLabels: Record<MysExpenseCategory, string>;
  subcategoryLabels: Record<string, string>;
  paymentLabels: Record<PaymentMethod, string>;
  reconciliationFlagLabels: Record<MysExpenseReconciliationFlag["type"], string>;
  applyingDateId: string | null;
  applySuggestedDate: (expenseId: string, suggestedDate: string) => void | Promise<void>;
  startEdit: (e: MysExpenseWithUrl) => void;
  deletingId: string | null;
  setPendingDelete: (value: { id: string; receiptPath: string | null } | null) => void;
  // An incomplete expense (missing a date and/or payment method) gets the same
  // leading clock icon as on the boat expenses list.
  isDraft?: boolean;
}) {
  const fromTable = e.attachments;
  const legacyEntry = e.receiptUrl && !fromTable.some((a) => a.path === e.receipt_path) ? [{ id: `${e.id}-receipt-legacy`, url: e.receiptUrl }] : [];
  const files = [...legacyEntry, ...fromTable.map((a) => ({ id: a.id, url: a.url }))];

  return (
    <div
      className={`flex flex-nowrap items-center gap-1.5 rounded-xl border p-3 sm:gap-3 ${
        flag?.type === "matched"
          ? "border-fleet-moss bg-fleet-moss/15"
          : flag
            ? "border-fleet-coral bg-fleet-coral/5"
            : "border-fleet-border bg-white"
      }`}
    >
      {isDraft && <Clock size={16} className="shrink-0 text-fleet-brass" aria-label={t("pending")} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" dir="auto">
          {e.description}
          {e.client_name && ` · ${e.client_name}`}
        </div>
        {/* Same line structure as the boat expenses rows: title, date on its
            own line, then category / payment method. */}
        <div className="truncate text-xs text-fleet-ink">
          {e.expense_date ? <span dir="ltr">{formatDateDisplay(e.expense_date)}</span> : t("not_set_yet")}
        </div>
        <div className="truncate text-xs text-fleet-ink">
          {e.category ? categoryLabels[e.category] : t("not_set_yet")}
          {e.subcategory ? ` (${subcategoryLabels[e.subcategory] ?? e.subcategory})` : ""}
          {e.payment_method ? ` · ${paymentLabels[e.payment_method]}` : ""}
          {e.client_price != null ? ` · ${t("mys_client_price_label")}: ${formatCurrency(e.client_price)}` : ""}
        </div>
        {e.linked_expense_id && (
          <div className="truncate text-2xs font-bold text-fleet-teal">
            {t("mys_linked_boat_expense_note", { boat: e.linkedBoatName ?? "" })}
          </div>
        )}
        {e.linked_ad_hoc_charge_id && (
          <div className="truncate text-2xs font-bold text-fleet-teal">
            {t("mys_linked_debt_charge_note", { client: e.client_name ?? "" })}
          </div>
        )}
        {flag && flag.type === "matched" ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-fleet-moss-text">
            <CheckCircle2 size={14} /> {reconciliationFlagLabels[flag.type]}
          </div>
        ) : flag ? (
          <div
            className={`mt-0.5 flex items-center gap-1.5 text-xs font-bold ${
              flag.type === "date_mismatch" ? "text-fleet-brass" : "text-fleet-coral-text"
            }`}
          >
            <AlertTriangle size={14} /> {reconciliationFlagLabels[flag.type]}
            {flag.suggestedDate && (
              <button
                type="button"
                disabled={applyingDateId === e.id}
                onClick={() => applySuggestedDate(e.id, flag.suggestedDate as string)}
                title={t("reconciliation_apply_suggested_date", { date: formatDateDisplay(flag.suggestedDate) })}
                className="flex items-center gap-1 rounded-full border border-fleet-coral px-2 py-0.5 font-semibold text-fleet-coral-text hover:bg-fleet-coral/10 disabled:opacity-60"
              >
                <ArrowLeftRight size={14} /> <span dir="ltr">{formatDateDisplay(flag.suggestedDate)}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
      <AttachmentGroup
        compact
        bordered={false}
        files={files}
        icon={<ReceiptEuro size={14} className="shrink-0" />}
        label={t("view_receipt")}
        onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
      />
      {/* Fixed-width, right-aligned digits so every row's amount lines up in
          one column (same as the boat expenses rows). */}
      <div dir="ltr" className="w-[5.5rem] shrink-0 whitespace-nowrap text-end text-sm font-bold tabular-nums text-fleet-navy sm:w-28 sm:text-base">
        {formatCurrency(e.amount)}
      </div>
      {/* Edit above delete, stacked, exactly like the boat expenses rows. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          iconOnly
          variant="text"
          size="compact"
          aria-label={t("edit_word")}
          className="!h-8 !w-8 !text-fleet-ink hover:!text-fleet-navy hover:!no-underline"
          onClick={() => startEdit(e)}
        >
          <Pencil size={14} className="h-3.5 w-3.5" />
        </Button>
        <button
          type="button"
          disabled={deletingId === e.id}
          onClick={() => setPendingDelete({ id: e.id, receiptPath: e.receipt_path })}
          aria-label={t("delete_word")}
          className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text disabled:opacity-50"
        >
          <Trash2 size={14} className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
