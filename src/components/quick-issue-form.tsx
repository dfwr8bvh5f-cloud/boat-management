"use client";

import { useRef, useState } from "react";
import { Camera, Plus, ReceiptEuro, ShieldCheck, X } from "lucide-react";
import { createIssue } from "@/lib/actions/issues";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { TechnicianSelect } from "@/components/technician-select";
import { AREAS, getAreaLabels, LOCATIONS_BY_AREA, CLASSIFICATIONS, getClassificationLabels } from "@/lib/labels";
import type { IssueArea, Technician } from "@/lib/types/database";
import { useFileDrop, setInputFilesMulti } from "@/lib/use-file-drop";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";

const inputClass = INPUT_CLASS;

// Dashboard shortcut for reporting a defect without leaving the boat
// overview page - same collapsible-card pattern as QuickExpenseForm, and the
// same fields/action as the full form on the Maintenance > Issues page.
export function QuickIssueForm({
  boatId,
  boats,
  technicians,
  locale,
  isManagement,
}: {
  boatId?: string;
  // Fleet-wide shortcut mode (the boats list page): lets management pick
  // which boat the issue belongs to instead of the form being pinned to one
  // boat - same pattern as QuickExpenseForm's `boats` prop.
  boats?: { id: string; name: string }[];
  technicians: Technician[];
  locale: Locale;
  isManagement?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const areaLabels = getAreaLabels(locale);
  const classificationLabels = getClassificationLabels(locale);

  // In fleet-wide mode, deliberately start with no boat picked - same reason
  // as QuickExpenseForm: defaulting to the first boat is how an issue ends
  // up reported against the wrong boat without anyone noticing.
  const [selectedBoatId, setSelectedBoatId] = useState(() => (boats ? "" : (boatId ?? "")));
  const effectiveBoatId = boats ? selectedBoatId : (boatId ?? "");
  const [boatError, setBoatError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [formAreaValue, setFormAreaValue] = useState("");
  const [formClassificationValue, setFormClassificationValue] = useState("");
  const [formLocationValue, setFormLocationValue] = useState("");
  const [, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [open, setOpen] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const quoteRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setPhotoError(t("scan_file_too_large"));
      return;
    }
    setPhotoFiles((prev) => {
      const next = [...prev, compressed];
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
  };
  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (photoRef.current) setInputFilesMulti(photoRef.current, next);
      return next;
    });
  };
  const addQuoteFile = (file: File | undefined) => {
    if (!file) return;
    setQuoteFiles((prev) => {
      const next = [...prev, file];
      if (quoteRef.current) setInputFilesMulti(quoteRef.current, next);
      return next;
    });
  };
  const removePendingQuote = (index: number) => {
    setQuoteFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (quoteRef.current) setInputFilesMulti(quoteRef.current, next);
      return next;
    });
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => addPhotoFile(file));
  const { dragging: quoteDragging, dropHandlers: quoteDropHandlers } = useFileDrop((file) => addQuoteFile(file));

  const resetForm = () => {
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setPhotoError(null);
    setQuoteFiles([]);
    setFormAreaValue("");
    setFormClassificationValue("");
    setFormLocationValue("");
    if (boats) setSelectedBoatId("");
    formRef.current?.reset();
  };

  // Anything typed/picked that hasn't been saved yet - same "don't lose
  // typed data" guard as QuickExpenseForm's close button.
  const isDirty = () => {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    return Boolean(
      titleRef.current?.value.trim() ||
        String(fd?.get("notes") ?? "").trim() ||
        fd?.get("is_warranty") === "on" ||
        formClassificationValue ||
        formAreaValue ||
        formLocationValue ||
        quoteFiles.length > 0 ||
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

  return (
    <details
      className="group rounded-xl border border-fleet-border bg-white p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className="relative flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy"
        onClick={(e) => {
          if (open) {
            e.preventDefault();
            handleCloseClick();
          }
        }}
      >
        <Plus size={16} /> {t("report_issue")}
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
          if (boats && !effectiveBoatId) {
            setBoatError(true);
            return;
          }
          setBoatError(false);
          setSaveError(null);
          setSaving(true);
          const formData = new FormData(e.currentTarget);
          try {
            await createIssue(effectiveBoatId, formData);
            resetForm();
          } catch (err) {
            setSaveError(err instanceof Error ? err.message : t("save_failed"));
          } finally {
            setSaving(false);
          }
        }}
        className="mt-4 flex flex-col gap-3"
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
        <div className={`grid grid-cols-1 gap-3 ${isManagement ? "sm:grid-cols-2" : ""}`}>
          {isManagement && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("issue_quote")}</label>
              <input
                ref={quoteRef}
                type="file"
                name="quotes"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  for (const file of Array.from(e.target.files ?? [])) addQuoteFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => quoteRef.current?.click()}
                {...quoteDropHandlers}
                className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
                  quoteDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
                }`}
              >
                <ReceiptEuro size={16} /> {t("issue_quote_upload")}
                {quoteDragging && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                    <Plus size={16} className="text-fleet-teal" />
                  </span>
                )}
              </button>
              {quoteFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quoteFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-2.5 py-1.5 text-xs">
                      <ReceiptEuro size={14} className="text-fleet-navy" />
                      <span className="max-w-[100px] truncate">{f.name}</span>
                      <button type="button" onClick={() => removePendingQuote(i)} aria-label={t("remove_word")} className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("photo")}</label>
            <input
              ref={photoRef}
              type="file"
              name="photos"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                for (const file of Array.from(e.target.files ?? [])) await addPhotoFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              {...photoDropHandlers}
              className={`relative flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
                photoDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
              }`}
            >
              <Camera size={16} /> {t("take_photo")}
              {photoDragging && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                  <Plus size={16} className="text-fleet-teal" />
                </span>
              )}
            </button>
            {photoError && <p className="text-xs text-fleet-coral-text">{photoError}</p>}
            {photoPreviews.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photoPreviews.map((url, i) => (
                  <div key={url} className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-12 w-12 rounded-lg border border-fleet-border object-cover" />
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
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_title_f")} *</label>
          <input ref={titleRef} name="title" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("date")}</label>
          <DateInput name="issue_date" locale={locale} className={inputClass} allowClear />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_classification")}</label>
            <CustomSelect
              name={formClassificationValue === "__other__" ? undefined : "classification"}
              value={formClassificationValue}
              onChange={setFormClassificationValue}
              options={[
                { value: "", label: "—" },
                ...CLASSIFICATIONS.map((k) => ({ value: k, label: classificationLabels[k] })),
                { value: "__other__", label: t("classif_other") },
              ]}
              emphasizeEmpty
              className={inputClass}
            />
            {formClassificationValue === "__other__" && (
              <input name="classification" required placeholder={t("classif_other")} className={inputClass} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_area")}</label>
            <CustomSelect
              name={formAreaValue === "__other__" ? undefined : "area"}
              value={formAreaValue}
              onChange={(v) => {
                setFormAreaValue(v);
                setFormLocationValue("");
              }}
              options={[
                { value: "", label: "—" },
                ...AREAS.map((k) => ({ value: k, label: areaLabels[k] })),
                { value: "__other__", label: t("area_other") },
              ]}
              emphasizeEmpty
              className={inputClass}
            />
            {formAreaValue === "__other__" && (
              <input name="area" required placeholder={t("area_other")} className={`mt-1.5 ${inputClass}`} />
            )}
          </div>
        </div>
        <div className="flex max-w-xs flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("issue_location")}</label>
          <CustomSelect
            name={formLocationValue === "__other__" ? undefined : "location"}
            value={formLocationValue}
            onChange={setFormLocationValue}
            options={[
              { value: "", label: "—" },
              ...((AREAS as string[]).includes(formAreaValue)
                ? LOCATIONS_BY_AREA[formAreaValue as IssueArea].map((loc) => ({ value: loc, label: loc }))
                : []),
              { value: "__other__", label: t("location_other") },
            ]}
            className={inputClass}
          />
          {formLocationValue === "__other__" && (
            <input name="location" placeholder={t("location_other")} className={inputClass} />
          )}
        </div>
        {isManagement && (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_supplier_parts")}</label>
            <TechnicianSelect name="supplier" technicians={technicians} locale={locale} isManagement={isManagement} />
          </div>
        )}
        {isManagement && (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("issue_supplier_labour")}</label>
            <TechnicianSelect name="supplier_labour" technicians={technicians} locale={locale} isManagement={isManagement} />
          </div>
        )}
        {isManagement && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("details")}</label>
            <textarea name="notes" rows={2} className={inputClass} />
          </div>
        )}
        {isManagement && (
          <label className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-sm text-fleet-navy">
            <input type="checkbox" name="is_warranty" className="h-4 w-4" />
            <ShieldCheck size={16} className="text-fleet-brass" /> {t("issue_is_warranty_label")}
          </label>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || (Boolean(boats) && !effectiveBoatId)}
            className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {t("report_issue")}
          </button>
          {(saving || saveError) && (
            <div className={`text-xs ${saveError ? "text-fleet-coral-text" : "text-fleet-moss"}`}>
              {saveError ? saveError : t("saving_word")}
            </div>
          )}
        </div>
      </form>
    </details>
  );
}
