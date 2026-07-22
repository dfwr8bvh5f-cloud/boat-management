"use client";

import { useRef, useState } from "react";
import { Camera, Plus, ReceiptEuro, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { createExpense } from "@/lib/actions/expenses";
import { getCategoryLabels, getExpenseCategories, PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { scanReceiptToPdf } from "@/lib/scan-to-pdf";
import { useFileDrop, setInputFilesMulti } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, ExpenseCategory } from "@/lib/types/database";

type ScanResult = {
  amount?: number | null;
  expense_date?: string | null;
  invoice_number?: string | null;
  boat_name?: string | null;
};

const inputClass = INPUT_CLASS;

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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [boatError, setBoatError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Two receipts photographed together for the same expense (e.g. fuel +
  // marina fee on one stop) should combine, not overwrite each other - but
  // only once we know the amount/invoice fields are scan-derived in the
  // first place. If she already typed a value before scanning, that's a
  // trusted manual entry and must never be silently changed by a scan.
  const scanDerivedAmountRef = useRef(false);
  const scanDerivedInvoiceRef = useRef(false);

  const resetFileState = () => {
    setReceiptFiles([]);
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  const resetForm = () => {
    formRef.current?.reset();
    resetFileState();
    setScanMsg(null);
    setDateValue("");
    setCategoryValue("");
    if (boats) setSelectedBoatId("");
  };

  // Anything typed/picked that hasn't been saved yet - checked before a
  // close so an accidental click can't silently wipe data she already
  // entered, mirroring the same "don't lose typed data" concern the
  // save-error handling below exists for.
  const isDirty = () => {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    return Boolean(
      descriptionRef.current?.value.trim() ||
        amountRef.current?.value.trim() ||
        invoiceRef.current?.value.trim() ||
        String(fd?.get("notes") ?? "").trim() ||
        fd?.get("payment_method") ||
        fd?.get("is_warranty") === "on" ||
        dateValue ||
        categoryValue ||
        receiptFiles.length > 0 ||
        photoPreviews.length > 0 ||
        (boats && selectedBoatId)
    );
  };

  const handleCloseClick = () => {
    if (isDirty() && !window.confirm(t("close_without_saving_confirm"))) return;
    resetForm();
    setBoatError(false);
    setCategoryError(false);
    setSaveError(null);
    setOpen(false);
  };

  const removePendingReceipt = (index: number) => {
    setReceiptFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (fileRef.current) setInputFilesMulti(fileRef.current, next);
      return next;
    });
  };

  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (cameraRef.current) setInputFilesMulti(cameraRef.current, next);
      return next;
    });
  };

  // isFirstOfBatch resets the scan-derived tracking so this batch doesn't
  // inherit "safe to sum into" from an unrelated, earlier scan. It's passed
  // explicitly by the caller (rather than checked off `receiptFiles.length`)
  // because this function runs from a stale closure across a multi-file
  // loop - the state update from file 1 hasn't re-rendered yet when file 2's
  // call starts, so `receiptFiles` would still read its pre-batch value for
  // every file in the batch.
  const onReceiptFile = async (file: File | undefined, isFirstOfBatch = true) => {
    if (!file) return;
    if (isFirstOfBatch) {
      scanDerivedAmountRef.current = false;
      scanDerivedInvoiceRef.current = false;
    }
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
    setReceiptFiles((prev) => {
      const next = [...prev, converted];
      if (fileRef.current) setInputFilesMulti(fileRef.current, next);
      return next;
    });
    if (forScan.size > MAX_SCAN_FILE_BYTES) {
      setScanOk(true);
      setScanMsg(t("scan_file_too_large_uploaded"));
      setScanning(false);
      return;
    }
    try {
      const body = new FormData();
      body.set("file", forScan);
      // Only in fleet-wide mode is the boat not already fixed by the page -
      // a closed list of names the AI is only allowed to echo back exactly,
      // never guess-match, since misrouting an expense to the wrong boat is
      // a financial-correctness problem, not a cosmetic one.
      if (boats) body.set("boat_names", JSON.stringify(boats.map((b) => b.name)));
      const res = await fetch("/api/scan-receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.amount != null && amountRef.current) {
        const current = amountRef.current.value.trim();
        if (current === "") {
          amountRef.current.value = String(result.amount);
          scanDerivedAmountRef.current = true;
        } else if (scanDerivedAmountRef.current) {
          amountRef.current.value = String(Math.round((parseFloat(current) + result.amount) * 100) / 100);
        }
      }
      if (result.invoice_number && invoiceRef.current) {
        const current = invoiceRef.current.value.trim();
        if (current === "") {
          invoiceRef.current.value = result.invoice_number;
          scanDerivedInvoiceRef.current = true;
        } else if (scanDerivedInvoiceRef.current && !current.split(", ").includes(result.invoice_number)) {
          invoiceRef.current.value = `${current}, ${result.invoice_number}`;
        }
      }
      if (result.expense_date) setDateValue(result.expense_date);
      if (boats && result.boat_name && !selectedBoatId) {
        const matchedBoat = boats.find((b) => b.name === result.boat_name);
        if (matchedBoat) {
          setSelectedBoatId(matchedBoat.id);
          setBoatError(false);
        }
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

  const { dragging: receiptDragging, dropHandlers: receiptDropHandlers } = useFileDrop((file) => onReceiptFile(file));

  return (
    <details
      className="group rounded-xl border border-fleet-border bg-white p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className="relative flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy"
        onClick={(e) => {
          // Clicking the heading itself natively toggles <details> - while
          // it's already open, that's a second, easy-to-hit way to close
          // (and silently lose typed data) besides the X below, so it goes
          // through the same guarded close instead of the native toggle.
          // Opening (closed -> open) has nothing to lose, so it's left alone.
          if (open) {
            e.preventDefault();
            handleCloseClick();
          }
        }}
      >
        <Plus size={16} /> {t("add_expense")}
        {open && (
          // A <button> here would nest an interactive element inside
          // <summary> (itself interactive) - invalid HTML. A click here
          // already bubbles to the summary's own onClick above, which
          // performs the identical guarded close while open, so no
          // separate handler is needed - purely a visual cue, same as the
          // Plus icon above, with the open/closed state itself already
          // conveyed to assistive tech natively via <details>/<summary>.
          <span className="absolute end-0 flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text">
            <X size={16} aria-hidden="true" />
          </span>
        )}
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
            resetForm();
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
              emphasizeEmpty
            />
            {boatError && <p className="text-xs text-fleet-coral-text">{t("select_boat")}</p>}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            {...receiptDropHandlers}
            className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy disabled:opacity-60 ${
              receiptDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
            }`}
          >
            {scanning ? <Sparkles size={16} className="animate-twinkle" /> : <Upload size={16} />} {scanning ? t("scanning") : t("scan_upload")}
            {receiptDragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={16} className="text-fleet-teal" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={scanning}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
          >
            <Camera size={16} /> {t("take_photo")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          name="receipts"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            for (let i = 0; i < files.length; i++) await onReceiptFile(files[i], i === 0);
          }}
        />
        {receiptFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {receiptFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                <ReceiptEuro size={14} className="text-fleet-navy" />
                <span className="max-w-[100px] truncate">{f.name}</span>
                <button type="button" onClick={() => removePendingReceipt(i)} aria-label={t("remove_word")} className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* A second, independent attachment - taking a photo here must not
            overwrite the receipt files picked above; they submit as separate
            form fields (receipts vs photos), matching the full edit form. */}
        <input
          ref={cameraRef}
          type="file"
          name="photos"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            for (const file of Array.from(e.target.files ?? [])) {
              const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
              setPhotoFiles((prev) => {
                const next = [...prev, compressed];
                if (cameraRef.current) setInputFilesMulti(cameraRef.current, next);
                return next;
              });
              setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
            }
          }}
        />
        {photoPreviews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photoPreviews.map((url, i) => (
              <div key={url} className="relative w-fit">
                {/* A visible thumbnail of the photo that was just taken/picked -
                    before, the only feedback was a checkmark on the button, easy
                    to miss and no real confirmation the right photo attached. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-16 w-16 rounded-lg border border-fleet-border object-cover" />
                <button
                  type="button"
                  onClick={() => removePendingPhoto(i)}
                  aria-label={t("remove_word")}
                  className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {scanMsg && (
          <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
            <Sparkles size={14} /> {scanMsg}
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
          {categoryError && <p className="text-xs text-fleet-coral-text">{t("choose_category")}</p>}
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
          <ShieldCheck size={16} className="text-fleet-brass" /> {t("is_warranty_label")}
        </label>
        <textarea name="notes" placeholder={t("new_expense_notes")} rows={2} className={inputClass} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || (Boolean(boats) && !effectiveBoatId)}
            className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {t("add_expense")}
          </button>
          {(saving || saved || saveError) && (
            <div className={`text-xs ${saveError ? "text-fleet-coral-text" : "text-fleet-moss-text"}`}>
              {saveError ? saveError : saving ? t("saving_word") : t("saved_word")}
            </div>
          )}
        </div>
      </form>
    </details>
  );
}
