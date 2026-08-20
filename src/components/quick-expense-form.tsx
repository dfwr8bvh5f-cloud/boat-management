"use client";

import { useRef, useState } from "react";
import { Camera, Plus, ReceiptEuro, ShieldCheck, Sparkles, X } from "lucide-react";
import { createExpense, createExpenseUploadUrl } from "@/lib/actions/expenses";
import { getCategoryLabels, getExpenseCategories, PAYMENT_METHODS, getPaymentLabels } from "@/lib/labels";
import { ConfirmPopup } from "@/components/confirm-popup";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { FileChip } from "@/components/file-chip";
import { PhotoThumb } from "@/components/photo-thumb";
import { RippleLoader } from "@/components/ripple-loader";
import { UploadButton } from "@/components/upload-button";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { scanReceiptToPdf } from "@/lib/scan-to-pdf";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

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
  const categories = getExpenseCategories(effectiveBoatType, effectiveBoatName, locale);
  const paymentLabels = getPaymentLabels(locale);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  // Neither the date nor the category default to a pre-filled value - an
  // auto-picked "today" or "other" that nobody actively chose is how a
  // wrong date/category slips into the books unnoticed.
  const [dateValue, setDateValue] = useState("");
  const [categoryValue, setCategoryValue] = useState<ExpenseCategory | "">("");
  const [paymentValue, setPaymentValue] = useState<PaymentMethod | "">("");
  // Uploaded straight to storage as soon as each file is picked (see
  // createExpenseUploadUrl) rather than kept as raw File objects to send
  // with the eventual save - only the tiny resulting paths are held here.
  const [receiptFiles, setReceiptFiles] = useState<{ path: string; name: string }[]>([]);
  const [photoFiles, setPhotoFiles] = useState<{ path: string; name: string }[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [boatError, setBoatError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
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
    setPaymentValue("");
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
    setSaveError(null);
    setOpen(false);
  };

  const removePendingReceipt = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    if (boats && !effectiveBoatId) {
      setBoatError(true);
      return;
    }
    setPhotoError(null);
    let compressed: File;
    try {
      compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    } catch (e) {
      setPhotoError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    try {
      const { path, token } = await createExpenseUploadUrl(effectiveBoatId, compressed.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, compressed);
      if (uploadError) throw uploadError;
      setPhotoFiles((prev) => [...prev, { path, name: compressed.name }]);
      setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("upload_failed"));
    }
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
    if (boats && !effectiveBoatId) {
      setBoatError(true);
      return;
    }
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
    let converted: File, forScan: File;
    try {
      [converted, forScan] = await Promise.all([
        scanReceiptToPdf(file, MAX_SCAN_FILE_BYTES),
        compressImageToLimit(file, MAX_SCAN_FILE_BYTES),
      ]);
    } catch (e) {
      setScanOk(false);
      setScanMsg(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      setScanning(false);
      return;
    }
    // Uploaded straight to storage here, before any scan attempt - so it's
    // kept as the expense's receipt regardless of whether the AI scan below
    // succeeds, fails, or (for an oversized file that isn't an image, e.g.
    // an existing PDF) doesn't even run at all.
    try {
      const { path, token } = await createExpenseUploadUrl(effectiveBoatId, converted.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("receipts").uploadToSignedUrl(path, token, converted);
      if (uploadError) throw uploadError;
      setReceiptFiles((prev) => [...prev, { path, name: converted.name }]);
    } catch (e) {
      setScanOk(false);
      setScanMsg(e instanceof Error ? e.message : t("upload_failed"));
      setScanning(false);
      return;
    }
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
  const { dragging: cameraDragging, dropHandlers: cameraDropHandlers } = useFileDrop((file) => onPhotoFile(file));

  // Only names the fields actually missing on this attempt, not a fixed
  // list of all three regardless of which ones were really left blank.
  const missingFieldLabels = () =>
    [!dateValue && t("date"), !categoryValue && t("category"), !paymentValue && t("payment_method")].filter(Boolean).join(" / ");

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      await createExpense(effectiveBoatId, formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Only clear the form once the save actually succeeded - a thrown
      // error used to crash the whole page (Next's generic error
      // boundary), which wiped every typed field with zero explanation.
      // Now a failure just shows the real reason and leaves everything
      // exactly as typed, ready to retry.
      resetForm();
      // Fleet-wide mode (the all-boats page) closes the panel right after
      // a successful save - on a single boat's own page it stays open,
      // since adding several expenses back-to-back there is the common
      // case.
      if (boats) setOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <details
      className="group rounded-xl group-open:border group-open:border-fleet-border group-open:bg-white group-open:p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className="relative flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-full bg-fleet-teal px-4 py-2.5 text-sm font-bold text-white transition-[background-color,transform,opacity] hover:opacity-90 active:scale-[0.98] group-open:rounded-lg group-open:bg-transparent group-open:p-0 group-open:text-fleet-navy group-open:hover:opacity-100 group-open:active:scale-100"
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
        onSubmit={(e) => {
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
          const formData = new FormData(e.currentTarget);
          // Receipts/photos are already uploaded (see onReceiptFile/
          // onPhotoFile) - only their storage paths ride along in the save
          // request now, not the file bytes themselves.
          receiptFiles.forEach((f) => formData.append("receipt_paths", f.path));
          photoFiles.forEach((f) => formData.append("photo_paths", f.path));
          // Date/payment method/category are no longer hard-blocked (an
          // expense missing one of these used to be impossible to save from
          // here, but perfectly fine from the full Expenses page) - an
          // in-app confirm popup now stands in for that gap consistently
          // across every place an expense can be created or edited.
          if (!dateValue || !categoryValue || !paymentValue) {
            setPendingFormData(formData);
            return;
          }
          doSave(formData);
        }}
        encType="multipart/form-data"
        className="animate-expand-in mt-4 flex flex-col gap-2.5"
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("receipt_invoice_label")}</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              for (let i = 0; i < files.length; i++) await onReceiptFile(files[i], i === 0);
            }}
          />
          <UploadButton
            onClick={() => fileRef.current?.click()}
            dropHandlers={receiptDropHandlers}
            dragging={receiptDragging}
            busy={scanning}
            done={receiptFiles.length > 0}
            label={t("scan_upload")}
            busyLabel={t("scanning")}
            doneLabel={t("add_another_file")}
            disabled={scanning}
          />
          {scanMsg && (
            <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
              <Sparkles size={14} /> {scanMsg}
            </div>
          )}
          {receiptFiles.length > 0 && (
            <div className="flex flex-col gap-1">
              {receiptFiles.map((f, i) => (
                <FileChip
                  key={i}
                  icon={<ReceiptEuro size={14} className="shrink-0" />}
                  name={f.name}
                  onRemove={() => removePendingReceipt(i)}
                  removeLabel={t("remove_word")}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("description")} *</label>
          <input ref={descriptionRef} name="description" required className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("category")}</label>
            <CustomSelect
              name="category"
              value={categoryValue}
              onChange={(v) => setCategoryValue(v as ExpenseCategory | "")}
              options={[{ value: "", label: t("not_set_yet") }, ...categories.map((c) => ({ value: c, label: categoryLabels[c] }))]}
              placeholder={t("not_set_yet")}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("payment_method")}</label>
            <CustomSelect
              name="payment_method"
              value={paymentValue}
              onChange={(v) => setPaymentValue(v as PaymentMethod | "")}
              options={[{ value: "", label: t("not_set_yet") }, ...PAYMENT_METHODS.map((p) => ({ value: p, label: paymentLabels[p] }))]}
              placeholder={t("not_set_yet")}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("amount")} *</label>
            <input ref={amountRef} name="amount" type="number" step="0.01" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("date")}</label>
            <DateInput name="expense_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} allowClear />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("invoice_number")}</label>
          <input ref={invoiceRef} name="invoice_number" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("expense_photo_label")}</label>
          {/* A second, independent attachment - taking a photo here must not
              overwrite the receipt files picked above; they submit as separate
              form fields (receipts vs photos), matching the full edit form. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              for (const file of Array.from(e.target.files ?? [])) await onPhotoFile(file);
            }}
          />
          <UploadButton
            onClick={() => cameraRef.current?.click()}
            dropHandlers={cameraDropHandlers}
            dragging={cameraDragging}
            icon={<Camera size={16} />}
            label={t("take_photo")}
          />
          {photoError && <p className="text-xs text-fleet-coral-text">{photoError}</p>}
          {photoPreviews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photoPreviews.map((url, i) => (
                <PhotoThumb key={url} src={url} onRemove={() => removePendingPhoto(i)} removeLabel={t("remove_word")} />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
          <textarea name="notes" rows={2} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
          <input type="checkbox" name="is_warranty" className="h-4 w-4" />
          <ShieldCheck size={16} className="text-fleet-brass" /> {t("is_warranty_label")}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || saved || (Boolean(boats) && !effectiveBoatId)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <>
                <RippleLoader size="sm" /> {t("saving_word")}
              </>
            ) : saved ? (
              <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
            ) : (
              t("add_expense")
            )}
          </button>
          {saveError && <div className="text-xs text-fleet-coral-text">{saveError}</div>}
        </div>
      </form>
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
    </details>
  );
}
