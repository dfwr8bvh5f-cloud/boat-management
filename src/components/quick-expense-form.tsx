"use client";

import { useRef, useState } from "react";
import { Camera, Plus, Sparkles } from "lucide-react";
import { createExpense } from "@/lib/actions/expenses";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_LABELS, PAID_BY_LABELS } from "@/lib/labels";
import type { ExpenseCategory } from "@/lib/types/database";

type ScanResult = {
  description?: string | null;
  amount?: number | null;
  expense_date?: string | null;
  invoice_number?: string | null;
  category?: string | null;
};

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function QuickExpenseForm({ boatId }: { boatId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanMsg(data.error ?? "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית.");
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.description && descriptionRef.current) descriptionRef.current.value = result.description;
      if (result.amount != null && amountRef.current) amountRef.current.value = String(result.amount);
      if (result.expense_date && dateRef.current) dateRef.current.value = result.expense_date;
      if (result.category && categoryRef.current && EXPENSE_CATEGORIES.includes(result.category as ExpenseCategory)) {
        categoryRef.current.value = result.category;
      }
      setScanMsg("הזיהוי האוטומטי מולא — בדוק ועדכן במידת הצורך.");
    } catch {
      setScanMsg("לא הצלחנו להתחבר לשירות הסריקה.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <details className="group rounded-xl border border-fleet-border bg-white p-4">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy">
        <Plus size={16} /> הוספת הוצאה
      </summary>
      <form action={createExpense.bind(null, boatId)} encType="multipart/form-data" className="mt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
        >
          {scanning ? <Sparkles size={15} /> : <Camera size={15} />} {scanning ? "סורק עם AI…" : "צלם / העלה חשבונית לסריקה"}
        </button>
        <input
          ref={fileRef}
          type="file"
          name="receipt"
          accept="image/*"
          className="hidden"
          onChange={(e) => onReceiptFile(e.target.files?.[0])}
        />
        {scanMsg && (
          <div className={`flex items-center gap-1 text-xs ${scanMsg.startsWith("הזיהוי") ? "text-fleet-moss" : "text-fleet-coral"}`}>
            <Sparkles size={12} /> {scanMsg}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <input ref={descriptionRef} name="description" placeholder="תיאור" required className={`${inputClass} col-span-2`} />
          <input ref={amountRef} name="amount" type="number" step="0.01" required placeholder="סכום (€)" className={inputClass} />
        </div>
        <select ref={categoryRef} name="category" defaultValue="other" className={inputClass}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input ref={dateRef} name="expense_date" type="date" defaultValue={today} className={inputClass} />
          <select name="payment_method" defaultValue="other" className={inputClass}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>
                {PAYMENT_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <select name="paid_by" defaultValue="crew" className={inputClass}>
          <option value="crew">{PAID_BY_LABELS.crew}</option>
          <option value="management">{PAID_BY_LABELS.management}</option>
        </select>
        <textarea name="notes" placeholder="הערות" rows={2} className={inputClass} />
        <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
          הוסף הוצאה
        </button>
      </form>
    </details>
  );
}
