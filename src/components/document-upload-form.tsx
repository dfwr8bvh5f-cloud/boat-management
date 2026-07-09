"use client";

import { useRef, useState } from "react";
import { Upload, Check, Plus } from "lucide-react";
import { uploadDocument } from "@/lib/actions/documents";
import { DateInput } from "@/components/date-input";
import { ClearFileButton } from "@/components/clear-file-button";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatType } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

// A plain native <input type="file"> shows the browser/OS's own "Choose
// file" / "No file chosen" text, which follows the device's language
// setting rather than this app's locale - hiding it behind a button we
// control (same pattern as the staff resume upload) keeps the whole form
// in the locale the user actually picked.
export function DocumentUploadForm({ boatId, boatType, locale }: { boatId: string; boatType: BoatType; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [filePicked, setFilePicked] = useState(false);
  const [fileError, setFileError] = useState(false);

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
    <form
      ref={formRef}
      action={async (formData) => {
        // The picker button is a hidden <input type="file"> underneath, and
        // hidden elements are exempt from native `required` validation - so
        // this has to be checked here instead, before ever calling the
        // server action (which would otherwise throw and crash to the
        // generic error boundary).
        if (!filePicked) {
          setFileError(true);
          return;
        }
        await uploadDocument(boatId, formData);
        formRef.current?.reset();
        setFilePicked(false);
      }}
      encType="multipart/form-data"
      className="grid grid-cols-1 gap-4 rounded-xl border border-fleet-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <h2 className="text-sm font-bold text-fleet-navy sm:col-span-2 lg:col-span-3">{t("doc_file_upload")}</h2>
      <input name="name" placeholder={t("doc_name")} className={inputClass} />
      <select name="doc_type" defaultValue="other" className={inputClass}>
        <option value="company_docs">{t("doc_company_docs")}</option>
        <option value="bank">{t("doc_bank")}</option>
        {boatType === "private" && <option value="charter_license">{t("doc_charter_license")}</option>}
        <option value="other">{t("doc_other")}</option>
      </select>
      <label className="flex flex-col gap-1 text-xs text-fleet-ink">
        {t("expiry_date")}
        <DateInput name="expiry_date" locale={locale} className={inputClass} />
      </label>
      <input
        ref={fileRef}
        type="file"
        name="file"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
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
      <div className="sm:col-span-2 lg:col-span-3">
        <button type="submit" className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90">
          {t("save_document")}
        </button>
      </div>
    </form>
  );
}
