"use client";

import { useRef, useState } from "react";
import { Camera, Plus, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { createExpense } from "@/lib/actions/expenses";
import { getCategoryLabels, getExpenseCategories, PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { scanReceiptToPdf } from "@/lib/scan-to-pdf";
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
  boats,
  locale,
}: {
  boatId?: string;
  boatType?: BoatType;
  boatName?: string;
  // Fleet-wide shortcut mode (the boats list page): lets the captain/manager
  // pick which boat the expense belongs to instead of the form being pinned
  // to one boat - categories re-filter to match whichever boat is selected,
  // same as they would on that boat's own page.
  boats?: { id: string; name: string; boat_type: BoatType }[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const categoryLabels = getCategoryLabels(locale);
  // In fleet-wide mode, deliberately start with no boat picked - defaulting
  // to the first one in the list is how an expense ends up on the wrong
  // boat without anyone noticing.
  const [selectedBoatId, setSelectedBoatId] = useState(() => (boats ? "" : (boatId ?? "")));
  const selectedBoat = boats?.find((b) => b.id === selectedBoatId);
  const effectiveBoatId = boats ? selectedBoatId : (boatId ?? "");
  const effectiveBoatType = boats ? selectedBoat?.boat_type : boatType;
  const effectiveBoatName = boats ? selectedBoat?.name : boatName;
  const categories = getExpenseCategories(effectiveBoatType, effectiveBoatName);
  const paymentLabels = getPaymentLabels(locale);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  // Neither the date nor the category default to a pre-filled value - an
  // auto-picked "today" or "other" that nobody actively chose is how a
  // wrong date/category slips into the books unnoticed.
  const [dateValue, setDateValue] = useState("");
  const [categoryValue, setCategoryValue] = useState<ExpenseCategory | "">("");
  const [receiptPicked, setReceiptPicked] = useState(false);
  const [photoPicked, setPhotoPicked] = useState(false);
  const [boatError, setBoatError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const clearReceipt = () => {
    if (fileRef.current) fileRef.current.value = "";
    setReceiptPicked(false);
    setScanMsg(null);
  };

  const clearPhoto = () => {
    if (cameraRef.current) cameraRef.current.value = "";
    setPhotoPicked(false);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
  };

  const onReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    setReceiptPicked(true);
    setScanning(true);
    setScanMsg(null);
    // Photographed receipts/invoices are turned into a cropped-to-the-
    // document, real PDF file instead of being kept as a raw photo with
    // the desk/hand/etc still visible - see scan-to-pdf.ts. That converted
    // file is what gets attached to the expense, but the AI scan itself is
    // sent a plain compressed JPEG instead of the hand-built PDF wrapper -
    // Claude reads images natively, so this avoids relying on the custom PDF
    // encoder (a hand-rolled byte format with no test coverage) for a step
    // that doesn't actually need it, while still keeping the request under
    // Vercel's request-size limit.
    const [converted, forScan] = await Promise.all([
      scanReceiptToPdf(file, MAX_SCAN_FILE_BYTES),
      compressImageToLimit(file, MAX_SCAN_FILE_BYTES),
    ]);
    // The file is attached here, before any scan attempt - so it's kept as
    // the expense's receipt regardless of whether the AI scan below
    // succeeds, fails, or (for an oversized file that isn't an image, e.g.
    // an existing PDF) doesn't even run at all.
    if (fileRef.current) setInputFiles(fileRef.current, converted);
    if (forScan.size > MAX_SCAN_FILE_BYTES) {
      setScanOk(true);
      setScanMsg(t("scan_file_too_large_uploaded"));
      setScanning(false);
      return;
    }
    try {
      const body = new FormData();
      body.set("file", forScan);
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
      if (result.invoice_number && invoiceRef.current && !invoiceRef.current.value.trim()) {
        invoiceRef.current.value = result.invoice_number;
      }
      if (result.expense_date) setDateValue(result.expense_date);
      if (result.category && categories.includes(result.category as ExpenseCategory)) {
        setCategoryValue(result.category as ExpenseCategory);
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
      <form
        ref={formRef}
        onSubmit={async (e) => {
          e.preventDefault();
          // Belt-and-suspenders alongside the select's own `required`: an
          // expense saved with no boat_id would be invisible everywhere
          // (every list/report/balance is scoped to a boat), so this is
          // checked again here rather than trusting native validation alone.
          if (boats && !effectiveBoatId) {
            setBoatError(true);
            return;
          }
          setBoatError(false);
          if (!categoryValue) {
            setCategoryError(true);
            return;
          }
          setCategoryError(false);
          setSaveError(null);
          setSaving(true);
          const formData = new FormData(e.currentTarget);
          try {
            await createExpense(effectiveBoatId, formData);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
            // Only clear the form once the save actually succeeded - a
            // thrown error used to crash the whole page (Next's generic
            // error boundary), which wiped every typed field with zero
            // explanation. Now a failure just shows the real reason and
            // leaves everything exactly as typed, ready to retry.
            formRef.current?.reset();
            setReceiptPicked(false);
            setPhotoPicked(false);
            setScanMsg(null);
            setDateValue("");
            setCategoryValue("");
            if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
            setPhotoPreviewUrl(null);
            if (boats) setSelectedBoatId("");
          } catch (err) {
            setSaveError(err instanceof Error ? err.message : t("save_failed"));
          } finally {
            setSaving(false);
          }
        }}
        encType="multipart/form-data"
        className="mt-4 flex flex-col gap-2.5"
      >
        {boats && (
          <div className="flex flex-col gap-1">
            <CustomSelect
              value={selectedBoatId}
              onChange={(v) => {
                setSelectedBoatId(v);
                setBoatError(false);
              }}
              options={boats.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={t("boat_name_field")}
              className={inputClass}
            />
            {boatError && <p className="text-xs text-fleet-coral">{t("select_boat")}</p>}
          </div>
        )}
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
            {scanning ? <Sparkles size={15} className="animate-twinkle" /> : <Upload size={15} />} {scanning ? t("scanning") : t("scan_upload")}
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
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
          >
            <Camera size={15} /> {photoPicked ? `✓ ${t("take_photo")}` : t("take_photo")}
          </button>
          {receiptPicked && <ClearFileButton onClear={clearReceipt} label={t("remove_word")} />}
          {photoPicked && <ClearFileButton onClear={clearPhoto} label={t("remove_word")} />}
        </div>
        <input
          ref={fileRef}
          type="file"
          name="receipt"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onReceiptFile(e.target.files?.[0])}
        />
        {/* A second, independent attachment - taking a photo here must not
            overwrite the receipt file picked above; they submit as separate
            form fields (receipt vs photo), matching the full edit form. */}
        <input
          ref={cameraRef}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !cameraRef.current) return;
            const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
            setInputFiles(cameraRef.current, compressed);
            setPhotoPicked(true);
            if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
            setPhotoPreviewUrl(URL.createObjectURL(compressed));
          }}
        />
        {photoPreviewUrl && (
          // A visible thumbnail of the photo that was just taken/picked -
          // before, the only feedback was a checkmark on the button, easy to
          // miss and no real confirmation the right photo actually attached.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreviewUrl} alt="" className="h-16 w-16 rounded-lg border border-fleet-border object-cover" />
        )}
        {scanMsg && (
          <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
            <Sparkles size={12} /> {scanMsg}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <input ref={descriptionRef} name="description" placeholder={t("description")} required className={`${inputClass} col-span-2`} />
          <input ref={amountRef} name="amount" type="number" step="0.01" required placeholder={t("amount")} className={inputClass} />
        </div>
        <input ref={invoiceRef} name="invoice_number" placeholder={t("invoice_number")} className={inputClass} />
        <div className="flex flex-col gap-1">
          <CustomSelect
            name="category"
            value={categoryValue}
            onChange={(v) => {
              setCategoryValue(v as ExpenseCategory);
              setCategoryError(false);
            }}
            options={categories.map((c) => ({ value: c, label: categoryLabels[c] }))}
            placeholder={t("choose_category")}
            className={inputClass}
          />
          {categoryError && <p className="text-xs text-fleet-coral">{t("choose_category")}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} allowClear />
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
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {t("add_expense")}
          </button>
          {(saving || saved || saveError) && (
            <div className={`text-xs ${saveError ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {saveError ? saveError : saving ? t("saving_word") : t("saved_word")}
            </div>
          )}
        </div>
      </form>
    </details>
  );
}
