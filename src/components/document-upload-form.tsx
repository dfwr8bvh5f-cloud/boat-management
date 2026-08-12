"use client";

import { useRef, useState } from "react";
import { Upload, Plus, X } from "lucide-react";
import { uploadDocument } from "@/lib/actions/documents";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { FileChip } from "@/components/file-chip";
import { RippleLoader } from "@/components/ripple-loader";
import { UploadButton } from "@/components/upload-button";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [docType, setDocType] = useState("");
  const [docTypeError, setDocTypeError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file || !fileRef.current) return;
    // Checked here, before the file ever reaches the server action - a
    // document (a scanned multi-page license/contract) can easily exceed
    // Vercel's ~4.5MB serverless request-body limit, which otherwise fails
    // outside any try/catch this component could wrap around the action
    // itself and crashes to the generic Next.js error boundary instead of
    // a message she can act on.
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    setInputFiles(fileRef.current, file);
    setFilePicked(true);
    setFileName(file.name);
    setFileError(false);
  };
  const { dragging, dropHandlers } = useFileDrop(onFile);
  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = "";
    setFilePicked(false);
    setFileName(null);
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
            setUploadError(null);
            setSaving(true);
            try {
              await uploadDocument(boatId, formData);
            } catch (e) {
              setSaving(false);
              setUploadError(e instanceof Error ? e.message : String(e));
              return;
            }
            setSaving(false);
            setSaved(true);
            setTimeout(() => {
              setSaved(false);
              formRef.current?.reset();
              setFilePicked(false);
              setDocType("");
              setShowForm(false);
            }, 1400);
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
              {docTypeError && <p className="text-xs text-fleet-coral-text">{t("choose_category")}</p>}
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
            <UploadButton
              onClick={() => fileRef.current?.click()}
              dropHandlers={dropHandlers}
              dragging={dragging}
              done={filePicked}
              fullWidth={false}
              label={t("upload_file")}
              doneLabel={t("photo_selected")}
            />
            {filePicked && fileName && (
              <FileChip icon={<Upload size={14} className="shrink-0" />} name={fileName} onRemove={clearFile} removeLabel={t("remove_word")} />
            )}
            {fileError && <p className="text-xs text-fleet-coral-text">{t("error_select_file")}</p>}
            {sizeError && <p className="text-xs text-fleet-coral-text">{t("doc_file_too_large")}</p>}
          </div>
          {uploadError && <p className="text-xs text-fleet-coral-text">{uploadError}</p>}
          <div>
            <button
              type="submit"
              disabled={saving || saved}
              className="flex items-center justify-center gap-2 rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <RippleLoader size="sm" /> {t("saving_word")}
                </>
              ) : saved ? (
                <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
              ) : (
                t("save_document")
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
