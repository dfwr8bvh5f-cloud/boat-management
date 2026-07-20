"use client";

import { useRef, useState } from "react";
import { Upload, Check, Plus, X } from "lucide-react";
import { uploadDocument } from "@/lib/actions/documents";
import { DateInput } from "@/components/date-input";
import { ClearFileButton } from "@/components/clear-file-button";
import { CustomSelect } from "@/components/custom-select";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";

const inputClass = INPUT_CLASS_COMPACT;

// A plain native <input type="file"> shows the browser/OS's own "Choose
// file" / "No file chosen" text, which follows the device's language
// setting rather than this app's locale - hiding it behind a button we
// control (same pattern as the staff resume upload) keeps the whole form
// in the locale the user actually picked.
export function DocumentUploadForm({ boatId, locale }: { boatId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [filePicked, setFilePicked] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [docType, setDocType] = useState("");
  const [docTypeError, setDocTypeError] = useState(false);

  const onFile = (file: File | undefined) => {
    if (!file || !fileRef.current) return;
    setInputFiles(fileRef.current, file);
    setFilePicked(true);
    setFileError(false);
  };
  const { dragging, dropHandlers } = useFileDrop(onFile);
  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = "";
    setFilePicked(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("add_document")}
            </span>
          )}
        </button>
      </div>
      {showForm && (
        <form
          ref={formRef}
          action={async (formData) => {
            // The picker button is a hidden <input type="file"> underneath, and
            // hidden elements are exempt from native `required` validation - so
            // this has to be checked here instead, before ever calling the
            // server action (which would otherwise throw and crash to the
            // generic error boundary). Same reasoning for doc_type, now a
            // CustomSelect backed by a hidden input.
            if (!filePicked) {
              setFileError(true);
              return;
            }
            if (!docType) {
              setDocTypeError(true);
              return;
            }
            await uploadDocument(boatId, formData);
            formRef.current?.reset();
            setFilePicked(false);
            setDocType("");
            setShowForm(false);
          }}
          encType="multipart/form-data"
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
        >
          <h2 className="text-sm font-bold text-fleet-navy">{t("doc_file_upload")}</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("doc_name")}</label>
            <input name="name" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("category")}</label>
              <CustomSelect
                name="doc_type"
                value={docType}
                onChange={(v) => {
                  setDocType(v);
                  setDocTypeError(false);
                }}
                options={[
                  { value: "charter_license", label: t("doc_charter_license") },
                  { value: "company_docs", label: t("doc_company_docs") },
                  { value: "myba_contract", label: t("doc_myba_contract") },
                  { value: "bank", label: t("doc_bank") },
                  { value: "insurance", label: t("doc_insurance") },
                  { value: "safety", label: t("doc_safety") },
                  { value: "other", label: t("doc_other") },
                ]}
                placeholder={t("choose_category")}
                emphasizeEmpty
                className={inputClass}
              />
              {docTypeError && <p className="text-xs text-fleet-coral">{t("choose_category")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("expiry_date")}</label>
              <DateInput name="expiry_date" locale={locale} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("notes_field")}</label>
            <textarea name="notes" rows={2} className={inputClass} />
          </div>
          <input
            ref={fileRef}
            type="file"
            name="file"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                {...dropHandlers}
                className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm ${
                  dragging
                    ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
                    : filePicked
                      ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss"
                      : fileError
                        ? "border-fleet-coral bg-fleet-coral/5 text-fleet-navy"
                        : "border-fleet-brass bg-fleet-paper text-fleet-navy"
                }`}
              >
                {filePicked ? <Check size={15} /> : <Upload size={15} />} {filePicked ? t("photo_selected") : t("upload_file")}
                {dragging && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                    <Plus size={18} className="text-fleet-teal" />
                  </span>
                )}
              </button>
              {filePicked && <ClearFileButton onClear={clearFile} label={t("remove_word")} />}
            </div>
            {fileError && <p className="text-xs text-fleet-coral">{t("error_select_file")}</p>}
          </div>
          <div>
            <button type="submit" className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90">
              {t("save_document")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
