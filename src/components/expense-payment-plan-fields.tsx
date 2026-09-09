"use client";

import { useState } from "react";
import { Plus, Paperclip } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { UploadButton } from "@/components/upload-button";
import { ClearFileButton } from "@/components/clear-file-button";
import { FileChip } from "@/components/file-chip";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { createExpenseUploadUrl } from "@/lib/actions/expenses";
import { PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import { todayLocalISO } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { PaymentMethod } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

// One staged "Payment N" row before it's saved - amount/method/date/proof-
// file, everything else (description/category/notes/...) is shared from
// the plan's own header fields and never asked for per payment.
export type PlanPaymentDraft = {
  key: string;
  amount: string;
  paymentMethod: PaymentMethod | "";
  // Defaults to today (the common case - logging a payment as it happens)
  // but is a real editable field, not a fixed timestamp, so a payment
  // entered after the fact can be dated for when it actually happened.
  date: string;
  proofPath: string | null;
  proofName: string | null;
};

export function newPlanPaymentDraft(): PlanPaymentDraft {
  return { key: crypto.randomUUID(), amount: "", paymentMethod: "", date: todayLocalISO(), proofPath: null, proofName: null };
}

// One payment row's own upload state lives here (not in the parent array),
// same reasoning as PhotoPickerButton/quick-expense-form's per-file upload
// handling - a hook like useFileDrop can't be called a variable number of
// times from a .map(), so each row needs to be its own component instance.
export function PaymentRow({
  index,
  payment,
  boatId,
  locale,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  payment: PlanPaymentDraft;
  boatId: string;
  locale: Locale;
  onChange: (payment: PlanPaymentDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const paymentLabels = getPaymentLabels(locale);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = `plan-proof-${payment.key}`;

  // Same upload-on-pick pattern as every receipt/photo field elsewhere in
  // this app (see expenses-manager.tsx's onReceiptFile/onPhotoFile) - the
  // file goes straight to storage via a signed URL, and only the resulting
  // path is kept here, so the plan's eventual save only ever ships tiny
  // path strings regardless of how many payments/proof files it has.
  const onProofFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { path, token } = await createExpenseUploadUrl(boatId, file.name);
      const supabase = createClient();
      const { error } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, file);
      if (error) throw error;
      onChange({ ...payment, proofPath: path, proofName: file.name });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const { dragging, dropHandlers } = useFileDrop((file) => void onProofFile(file));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-fleet-navy">{t("payment_n", { n: index + 1 })}</span>
        {canRemove && <ClearFileButton onClear={onRemove} label={t("remove_word")} />}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          step="0.01"
          name="payment_amount"
          placeholder={`${t("amount")} *`}
          value={payment.amount}
          onChange={(e) => onChange({ ...payment, amount: e.target.value })}
          onWheel={(e) => e.currentTarget.blur()}
          className={INPUT_CLASS}
        />
        <DateInput
          name="payment_expense_date"
          value={payment.date}
          onChange={(v) => onChange({ ...payment, date: v })}
          locale={locale}
          className={INPUT_CLASS}
        />
        <CustomSelect
          name="payment_payment_method"
          value={payment.paymentMethod}
          onChange={(v) => onChange({ ...payment, paymentMethod: v as PaymentMethod })}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: paymentLabels[m] }))}
          placeholder={t("payment_method")}
          className={INPUT_CLASS}
        />
      </div>
      {/* Rides along with the surrounding <form>'s native FormData
          (payment_amount/payment_payment_method/payment_expense_date/
          payment_proof_path, one set per payment row - see
          readPlanPayments, expenses.ts) when this is used inside a real
          submit form; harmless when it isn't (addStagedPayments in
          expenses-manager.tsx reads payment state directly instead). */}
      <input type="hidden" name="payment_proof_path" value={payment.proofPath ?? ""} />
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void onProofFile(e.target.files?.[0])}
      />
      {payment.proofPath ? (
        <FileChip
          icon={<Paperclip size={14} className="shrink-0" />}
          name={payment.proofName ?? t("proof_of_payment")}
          onRemove={() => onChange({ ...payment, proofPath: null, proofName: null })}
          removeLabel={t("remove_word")}
        />
      ) : (
        <UploadButton
          onClick={() => document.getElementById(inputId)?.click()}
          dropHandlers={dropHandlers}
          dragging={dragging}
          busy={uploading}
          icon={<Paperclip size={14} />}
          label={t("proof_of_payment")}
          busyLabel={t("uploading_word")}
          compact
        />
      )}
      {uploadError && <p className="text-xs text-fleet-coral-text">{uploadError}</p>}
    </div>
  );
}

// The editable "Payment 1 / Payment 2 / + Add payment" block shown once the
// "not yet fully paid" checkbox is on - shared by expenses-manager.tsx and
// quick-expense-form.tsx so both forms build/save plans identically.
export function ExpensePaymentPlanFields({
  boatId,
  payments,
  onChange,
  locale,
  // How many payments already exist before this staged batch (e.g. reopening
  // an in-progress plan that already has payments saved) - offsets the
  // "Payment N" numbering so a newly staged row continues counting from
  // there instead of restarting at "Payment 1".
  startIndex = 0,
}: {
  boatId: string;
  payments: PlanPaymentDraft[];
  onChange: (payments: PlanPaymentDraft[]) => void;
  locale: Locale;
  startIndex?: number;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <div className="flex flex-col gap-2">
      {payments.map((p, i) => (
        <PaymentRow
          key={p.key}
          index={startIndex + i}
          payment={p}
          boatId={boatId}
          locale={locale}
          onChange={(next) => onChange(payments.map((x) => (x.key === p.key ? next : x)))}
          onRemove={() => onChange(payments.filter((x) => x.key !== p.key))}
          canRemove={payments.length > 1}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...payments, newPlanPaymentDraft()])}
        className="inline-flex w-fit items-center gap-1 text-xs font-bold text-fleet-teal"
      >
        <Plus size={14} /> {t("add_payment")}
      </button>
    </div>
  );
}
