"use client";

import { useRef, useState } from "react";
import { Camera, Plus, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { createExpense } from "@/lib/actions/expenses";
import { getCategoryLabels, getExpenseCategories, PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { DateInput } from "@/components/date-input";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { ClearFileButton } from "@/components/clear-file-button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, ExpenseCategory } from "@/lib/types/database";

type ScanResult = {
  description?: string | null;
  amount?: number | null;
  expense_date?: string | null;
  invoice_number?: string | null;
  category?: string | null;
};

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function QuickExpenseForm({
  boatId,
  boatType,
  boatName,
  locale,
}: {
  boatId: string;
  boatType: BoatType;
  boatName: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boatType, boatName);
  const paymentLabels = getPaymentLabels(locale);

  const today = new Date().toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  const [dateValue, setDateValue] = useState(today);
  const [receiptPicked, setReceiptPicked] = useState(false);

  const clearReceipt = () => {
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    setReceiptPicked(false);
    setScanMsg(null);
  };

  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    setReceiptPicked(true);
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.description && descriptionRef.current) descriptionRef.current.value = result.description;
      if (result.amount != null && amountRef.current) amountRef.current.value = String(result.amount);
      if (result.expense_date) setDateValue(result.expense_date);
      if (result.category && categoryRef.current && categories.includes(result.category as ExpenseCategory)) {
        categoryRef.current.value = result.category;
      }
      setScanOk(true);
      setScanMsg(t("scan_ok"));
    } catch {
      setScanOk(false);
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  const { dragging: receiptDragging, dropHandlers: receiptDropHandlers } = useFileDrop((file) => {
    if (fileRef.current) setInputFiles(fileRef.current, file);
    onReceiptFile(file);
  });

  return (
    <details className="group rounded-xl border border-fleet-border bg-white p-4">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy">
        <Plus size={16} /> {t("add_expense")}
      </summary>
      <form action={createExpense.bind(null, boatId)} encType="multipart/form-data" className="mt-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            {...receiptDropHandlers}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy disabled:opacity-60 ${
              receiptDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
            }`}
          >
            {scanning ? <Sparkles size={15} /> : <Upload size={15} />} {scanning ? t("scanning") : t("scan_upload")}
            {receiptDragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={18} className="text-fleet-teal" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
          >
            <Camera size={15} /> {t("take_photo")}
          </button>
          {receiptPicked && <ClearFileButton onClear={clearReceipt} label={t("remove_word")} />}
        </div>
        <input
          ref={fileRef}
          type="file"
          name="receipt"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onReceiptFile(e.target.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && fileRef.current) setInputFiles(fileRef.current, file);
            onReceiptFile(file);
          }}
        />
        {scanMsg && (
          <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
            <Sparkles size={12} /> {scanMsg}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <input ref={descriptionRef} name="description" placeholder={t("description")} required className={`${inputClass} col-span-2`} />
          <input ref={amountRef} name="amount" type="number" step="0.01" required placeholder={t("amount")} className={inputClass} />
        </div>
        <select ref={categoryRef} name="category" defaultValue="other" className={inputClass}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} />
          <select name="payment_method" defaultValue="" className={inputClass}>
            <option value="">{t("not_set_yet")}</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>
                {paymentLabels[p]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
          <input type="checkbox" name="is_warranty" className="h-4 w-4" />
          <ShieldCheck size={15} className="text-fleet-brass" /> {t("is_warranty_label")}
        </label>
        <textarea name="notes" placeholder={t("new_expense_notes")} rows={2} className={inputClass} />
        <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
          {t("add_expense")}
        </button>
      </form>
    </details>
  );
}
