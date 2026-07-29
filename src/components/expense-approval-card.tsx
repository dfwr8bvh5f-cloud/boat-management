"use client";

import { useState } from "react";
import { Camera, Pencil, ReceiptEuro, Wallet, X } from "lucide-react";
import { approveExpense, deleteExpense, updateAndApproveExpense } from "@/lib/actions/expenses";
import { ConfirmPopup } from "@/components/confirm-popup";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AttachmentGroup } from "@/components/attachment-group";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Expense, ExpenseCategory, PaymentMethod } from "@/lib/types/database";
import { PAYMENT_METHODS } from "@/lib/labels";
import { isPdfUrl } from "@/lib/upload";

export function ExpenseApprovalCard({
  expense,
  boatName,
  submittedBy,
  receiptFiles,
  photoFiles,
  categories,
  categoryLabels,
  paymentLabels,
  locale,
}: {
  expense: Expense;
  boatName: string;
  submittedBy: string;
  receiptFiles: { id: string; url: string }[];
  photoFiles: { id: string; url: string }[];
  categories: ExpenseCategory[];
  categoryLabels: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const [editing, setEditing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState(expense.expense_date ?? "");
  const [categoryValue, setCategoryValue] = useState<ExpenseCategory | "">(expense.category ?? "");
  const [paymentValue, setPaymentValue] = useState<PaymentMethod | "">(expense.payment_method ?? "");
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  const inputClass = "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm";
  // Only names the fields actually missing on this attempt, not a fixed
  // list of all three regardless of which ones were really left blank.
  const missingFieldLabels = () =>
    [!dateValue && t("date"), !categoryValue && t("category"), !paymentValue && t("payment_method")].filter(Boolean).join(" / ");
  const doSave = async (formData: FormData) => {
    await updateAndApproveExpense(expense.boat_id, expense.id, formData);
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
          <Wallet size={16} className="text-fleet-brass" />
        </div>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <div className="text-sm font-bold">{expense.description}</div>
              <div className="text-xs text-fleet-ink">
                {boatName} · {expense.expense_date ? <span dir="ltr">{formatDateDisplay(expense.expense_date)}</span> : t("not_set_yet")} ·{" "}
                {expense.category ? categoryLabels[expense.category] : t("not_set_yet")} ·{" "}
                {expense.payment_method ? paymentLabels[expense.payment_method] : t("not_set_yet")} · {formatCurrency(expense.amount)}
              </div>
              <div className="mt-0.5 text-2xs text-fleet-ink/70">
                {t("submitted_by")} {submittedBy}
              </div>
            </>
          ) : (
            <form
              id={`approve-edit-${expense.id}`}
              action={async (formData) => {
                if (!dateValue || !categoryValue || !paymentValue) {
                  setPendingFormData(formData);
                  return;
                }
                await doSave(formData);
              }}
              className="flex flex-col gap-2"
            >
              <input
                name="description"
                required
                defaultValue={expense.description}
                className={inputClass}
                placeholder={t("description")}
              />
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  name="category"
                  value={categoryValue}
                  onChange={(v) => setCategoryValue(v as ExpenseCategory)}
                  options={[{ value: "", label: t("not_set_yet") }, ...categories.map((k) => ({ value: k, label: categoryLabels[k] }))]}
                  className={inputClass}
                />
                <CustomSelect
                  name="payment_method"
                  value={paymentValue}
                  onChange={(v) => setPaymentValue(v as PaymentMethod)}
                  options={[
                    { value: "", label: t("not_set_yet") },
                    ...PAYMENT_METHODS.map((k) => ({ value: k, label: paymentLabels[k] })),
                  ]}
                  className={inputClass}
                />
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={expense.amount}
                  className={inputClass}
                  placeholder={t("amount")}
                />
                <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} allowClear />
                <input
                  name="invoice_number"
                  defaultValue={expense.invoice_number ?? ""}
                  className={inputClass}
                  placeholder={t("invoice_number")}
                />
              </div>
              <textarea
                name="notes"
                rows={2}
                defaultValue={expense.notes ?? ""}
                className={inputClass}
                placeholder={t("new_expense_notes")}
              />
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label="edit"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
        >
          <Pencil size={16} />
        </button>
      </div>

      {(receiptFiles.length > 0 || photoFiles.length > 0) && (
        <div className="mt-2 flex gap-2">
          <AttachmentGroup files={receiptFiles} icon={<ReceiptEuro size={14} />} label={t("view_receipt")} onOpen={setLightboxUrl} />
          <AttachmentGroup files={photoFiles} icon={<Camera size={14} />} label={t("view_photo")} onOpen={setLightboxUrl} />
        </div>
      )}

      <div className="mt-2.5 flex gap-2">
        {editing ? (
          <>
            <button
              type="submit"
              form={`approve-edit-${expense.id}`}
              className="flex-1 rounded-lg bg-fleet-teal py-2 text-xs font-bold text-white"
            >
              {t("save_and_approve")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-fleet-border py-2 text-xs font-bold text-fleet-ink"
            >
              {t("cancel_word")}
            </button>
          </>
        ) : (
          <>
            <form action={approveExpense.bind(null, expense.boat_id, expense.id)} className="flex-1">
              <button type="submit" className="w-full rounded-lg bg-fleet-teal py-2 text-xs font-bold text-white">
                {t("approve")}
              </button>
            </form>
            <form action={deleteExpense.bind(null, expense.boat_id, expense.id, expense.receipt_path, expense.photo_path)} className="flex-1">
              <ConfirmSubmitButton
                locale={locale}
                confirmMessage={t("approvals_reject_confirm")}
                className="w-full rounded-lg border border-fleet-coral py-2 text-xs font-bold text-fleet-coral-text"
              >
                {t("reject")}
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </div>

      {pendingFormData && (
        <ConfirmPopup
          message={t("expense_missing_fields_confirm", { fields: missingFieldLabels() })}
          onCancel={() => setPendingFormData(null)}
          onConfirm={() => {
            const formData = pendingFormData;
            setPendingFormData(null);
            doSave(formData);
          }}
          locale={locale}
        />
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="close"
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={16} />
          </button>
          {isPdfUrl(lightboxUrl) ? (
            <iframe src={`${lightboxUrl}#view=FitH`} title="receipt" className="h-[85vh] w-[90vw] rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
