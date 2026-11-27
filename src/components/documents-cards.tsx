"use client";

import { Fragment, useDeferredValue, useMemo, useRef, useState } from "react";
import { Filter, Pencil, Search, Trash2, Eye, Download, Share2, Upload } from "lucide-react";
import { updateDocument, deleteDocument, approveDocument, createDocumentUploadUrl } from "@/lib/actions/documents";
import { createClient } from "@/lib/supabase/client";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DotsLoader } from "@/components/dots-loader";
import { DateInput } from "@/components/date-input";
import { FileChip } from "@/components/file-chip";
import { UncontrolledCustomSelect } from "@/components/uncontrolled-custom-select";
import { UploadButton } from "@/components/upload-button";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { MAX_DIRECT_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { MYBA_CONTRACT_NAME_PREFIX } from "@/lib/balances";
import { formatDateDisplay } from "@/lib/date-format";
import { isDocumentExpiringSoon, isDocumentExpired } from "@/lib/document-status";
import { DOC_CATEGORIES, DOC_TYPE_LABEL_KEYS } from "@/lib/document-categories";
import { useDocumentShare } from "@/lib/use-document-share";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_COMPACT, SEARCH_INPUT_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatDocument } from "@/lib/types/database";

const inputClass = INPUT_CLASS_COMPACT;

// Each document renders as a stacked card, matching the row style every
// other list in the app uses (expenses, staff, cash, bookings) - used at
// every screen size, not just mobile.
export function DocumentsCards({
  boatId,
  documents,
  canEdit,
  isManagement,
  locale,
}: {
  boatId: string;
  documents: BoatDocument[];
  canEdit: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const { sharingId, shareDocument } = useDocumentShare(boatId);
  // Only ever one edit form mounted at a time (gated by editingId below),
  // so a single top-level ref/state for the replacement file - reset
  // whenever a different row's edit is opened - is safe to share across
  // rows, same as the rest of this edit form's own uncontrolled fields.
  const editFileRef = useRef<HTMLInputElement>(null);
  const [editFileName, setEditFileName] = useState<string | null>(null);
  const [editFileSizeError, setEditFileSizeError] = useState(false);
  const onEditFile = (file: File | undefined) => {
    if (!file || !editFileRef.current) return;
    if (file.size > MAX_DIRECT_UPLOAD_FILE_BYTES) {
      setEditFileSizeError(true);
      return;
    }
    setEditFileSizeError(false);
    setInputFiles(editFileRef.current, file);
    setEditFileName(file.name);
  };
  const { dragging: editFileDragging, dropHandlers: editFileDropHandlers } = useFileDrop(onEditFile);
  const clearEditFile = () => {
    if (editFileRef.current) editFileRef.current.value = "";
    setEditFileName(null);
  };
  const startEdit = (docId: string) => {
    setEditingId(docId);
    setEditFileName(null);
    setEditFileSizeError(false);
  };
  // Deferred + memoized so fast typing stays responsive and an unrelated
  // re-render (e.g. toggling editingId) doesn't recompute the filter - see
  // the identical pattern/comment in expenses-manager.tsx. Both hooks must
  // stay above the early return below (Rules of Hooks).
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  // Expired documents sink to the bottom under their own heading; the sort is
  // stable so the category grouping from the page is kept within each half.
  const filtered = useMemo(
    () =>
      documents
        .filter(
          (doc) =>
            (catFilter.length === 0 || catFilter.includes(doc.doc_type)) &&
            (deferredSearchTerm === "" ||
              doc.name.toLowerCase().includes(deferredSearchTerm) ||
              (doc.notes ?? "").toLowerCase().includes(deferredSearchTerm))
        )
        .sort((a, b) => Number(isDocumentExpired(a.expiry_date)) - Number(isDocumentExpired(b.expiry_date))),
    [documents, catFilter, deferredSearchTerm]
  );
  const firstExpiredId = filtered.find((d) => isDocumentExpired(d.expiry_date))?.id;

  if (documents.length === 0) {
    return <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_documents")}</p>;
  }

  const toggleCatFilter = (k: string) =>
    setCatFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("nav_documents")}</h1>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className={SEARCH_INPUT_CLASS}
        />
      </div>

      <div>
        <Chip active={catFilter.length > 0} onClick={() => setShowFilters((s) => !s)}>
          <Filter size={14} /> {t("expense_filters")}{catFilter.length > 0 ? ` (${catFilter.length})` : ""}
        </Chip>
        {showFilters && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div>
              <div className="mb-1.5 text-2xs font-bold text-fleet-ink">{t("category")}</div>
              <div className="flex flex-wrap gap-1.5">
                {DOC_CATEGORIES.map((c) => (
                  <Chip key={c.value} active={catFilter.includes(c.value)} onClick={() => toggleCatFilter(c.value)}>
                    {t(c.labelKey)}
                  </Chip>
                ))}
              </div>
            </div>
            {catFilter.length > 0 && (
              <button onClick={() => setCatFilter([])} className="w-fit text-xs text-fleet-coral-text">
                {t("expense_filters_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_documents")}</p>
      )}
      {filtered.map((doc) => (
        <Fragment key={doc.id}>
          {doc.id === firstExpiredId && (
            <h2 className="mt-2 text-sm font-bold text-fleet-ink">{t("docs_expired_section")}</h2>
          )}
          {editingId === doc.id ? (
          <div className="rounded-xl border border-fleet-border bg-white p-4">
            <form
              action={async (formData) => {
                setSaving(true);
                // A replacement file goes straight to storage; only its path
                // is sent to the server action (see createDocumentUploadUrl).
                const replacement = formData.get("file");
                let uploadedPath: string | null = null;
                try {
                  if (replacement instanceof File && replacement.size > 0) {
                    const { path, token } = await createDocumentUploadUrl(boatId, replacement.name);
                    const { error: storageError } = await createClient()
                      .storage.from("documents")
                      .uploadToSignedUrl(path, token, replacement, { contentType: replacement.type || undefined });
                    if (storageError) throw new Error(storageError.message);
                    uploadedPath = path;
                    formData.set("file_path", path);
                  }
                  formData.delete("file");
                  await updateDocument(boatId, doc.id, formData);
                } catch (err) {
                  console.error("document update failed:", err);
                  if (uploadedPath) await createClient().storage.from("documents").remove([uploadedPath]);
                  setSaving(false);
                  throw err;
                }
                setSaving(false);
                setSaved(true);
                setTimeout(() => {
                  setSaved(false);
                  setEditingId(null);
                }, 1400);
              }}
              encType="multipart/form-data"
              className="flex flex-col gap-3"
            >
              <input name="name" defaultValue={doc.name} placeholder={t("doc_name")} className={inputClass} />
              <UncontrolledCustomSelect
                name="doc_type"
                defaultValue={doc.doc_type}
                options={[
                  // A legacy category (e.g. the auto-created MYBA contract)
                  // stays selectable on the rows that already have it.
                  ...(DOC_CATEGORIES.some((c) => c.value === doc.doc_type)
                    ? []
                    : [{ value: doc.doc_type, label: t(DOC_TYPE_LABEL_KEYS[doc.doc_type] ?? "doc_other") }]),
                  ...DOC_CATEGORIES.map((c) => ({ value: c.value, label: t(c.labelKey) })),
                ]}
                className={inputClass}
              />
              <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                {t("expiry_date")}
                <DateInput name="expiry_date" defaultValue={doc.expiry_date ?? undefined} locale={locale} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                {t("notes_field")}
                <textarea name="notes" rows={2} defaultValue={doc.notes ?? ""} className={inputClass} />
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("doc_replace_file_label")}</label>
                <input
                  ref={editFileRef}
                  type="file"
                  name="file"
                  className="hidden"
                  onChange={(e) => onEditFile(e.target.files?.[0])}
                />
                <UploadButton
                  onClick={() => editFileRef.current?.click()}
                  dropHandlers={editFileDropHandlers}
                  dragging={editFileDragging}
                  done={editFileName != null}
                  fullWidth={false}
                  label={t("upload_file")}
                  doneLabel={t("photo_selected")}
                />
                {editFileName && (
                  <FileChip icon={<Upload size={14} className="shrink-0" />} name={editFileName} onRemove={clearEditFile} removeLabel={t("remove_word")} />
                )}
                {editFileSizeError && <p className="text-xs text-fleet-coral-text">{t("doc_file_too_large_50")}</p>}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
                  {t("close_word")}
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={saving || saved}>
                  {saving ? (
                    <>
                      <DotsLoader size="sm" /> {t("saving_word")}
                    </>
                  ) : saved ? (
                    <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
                  ) : (
                    t("save_word")
                  )}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border p-3 ${
              isDocumentExpiringSoon(doc.expiry_date) ? "bg-fleet-coral/5" : "bg-white"
            }`}
          >
            <div className="min-w-[140px] flex-1">
              <div className="text-sm font-semibold">
                {doc.name.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                  ? `${t("doc_myba_contract")} - ${doc.name.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                  : doc.name}
              </div>
              <div className="text-xs text-fleet-ink">
                {doc.expiry_date ? (
                  <span className={isDocumentExpiringSoon(doc.expiry_date) ? "font-medium text-fleet-coral-text" : undefined}>
                    <span dir="ltr">{formatDateDisplay(doc.expiry_date)}</span>
                    {isDocumentExpiringSoon(doc.expiry_date) ? ` (${t("expiring_soon")})` : ""}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              {doc.notes && <div className="mt-0.5 text-xs text-fleet-ink">{doc.notes}</div>}
              <div className="mt-1 flex items-center gap-2">
                {/* Plain text (no pill): the category reads as a label and the
                    validity badge stays the only coloured signal on the row. */}
                <span className="text-2xs font-bold text-fleet-ink">{t(DOC_TYPE_LABEL_KEYS[doc.doc_type] ?? "doc_other")}</span>
                <span
                  className={`shrink-0 whitespace-nowrap text-2xs font-bold ${
                    isDocumentExpired(doc.expiry_date) ? "text-fleet-coral-text" : "text-fleet-moss-text"
                  }`}
                >
                  {isDocumentExpired(doc.expiry_date) ? t("doc_not_valid") : t("doc_valid")}
                </span>
              </div>
            </div>
            <a
              href={`/boats/${boatId}/documents/${doc.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("doc_view")}
              title={t("doc_view")}
              className="flex h-9 w-9 items-center justify-center text-fleet-brass hover:text-fleet-navy"
            >
              <Eye size={16} />
            </a>
            <a
              href={`/boats/${boatId}/documents/${doc.id}/download?download=1`}
              aria-label={t("manifest_download")}
              title={t("manifest_download")}
              className="flex h-9 w-9 items-center justify-center text-fleet-brass hover:text-fleet-navy"
            >
              <Download size={16} />
            </a>
            <button
              type="button"
              onClick={() => shareDocument(doc)}
              disabled={sharingId === doc.id}
              aria-label={t("doc_share")}
              title={t("doc_share")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-brass transition-transform hover:bg-fleet-paper hover:text-fleet-navy active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
            >
              {sharingId === doc.id ? <DotsLoader size="sm" /> : <Share2 size={16} />}
            </button>
            {canEdit && (
              <>
                {isManagement && doc.status === "pending" && (
                  <form action={approveDocument.bind(null, boatId, doc.id)}>
                    <Button type="submit" variant="text" size="compact" className="px-0 py-0 !text-fleet-moss-text">
                      {t("approve")}
                    </Button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(doc.id)}
                  aria-label={t("edit_word")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-navy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
                >
                  <Pencil size={16} />
                </button>
                <form action={deleteDocument.bind(null, boatId, doc.id, doc.file_path)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("delete_doc_confirm")}
                    destructive
                    ariaLabel={t("delete_word")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-coral-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
                  >
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              </>
            )}
          </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
