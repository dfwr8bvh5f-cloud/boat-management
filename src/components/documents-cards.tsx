"use client";

import { useState } from "react";
import { FileText, Filter, Pencil, Search, Trash2, Eye, Download, Share2 } from "lucide-react";
import { updateDocument, deleteDocument, approveDocument } from "@/lib/actions/documents";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { MYBA_CONTRACT_NAME_PREFIX } from "@/lib/balances";
import { formatDateDisplay } from "@/lib/date-format";
import { isDocumentExpiringSoon, isDocumentExpired } from "@/lib/document-status";
import { useDocumentShare } from "@/lib/use-document-share";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatDocument } from "@/lib/types/database";

const inputClass = INPUT_CLASS_COMPACT;

// Matches the categories offered in the upload/edit dropdowns.
const DOC_TYPE_LABEL_KEYS: Record<string, Parameters<typeof translate>[1]> = {
  charter_license: "doc_charter_license",
  company_docs: "doc_company_docs",
  myba_contract: "doc_myba_contract",
  bank: "doc_bank",
  insurance: "doc_insurance",
  safety: "doc_safety",
  other: "doc_other",
};
const DOC_TYPES = Object.keys(DOC_TYPE_LABEL_KEYS);

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
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const { sharingId, shareDocument } = useDocumentShare(boatId);

  if (documents.length === 0) {
    return <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_documents")}</p>;
  }

  const toggleCatFilter = (k: string) =>
    setCatFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const searchTerm = search.trim().toLowerCase();
  const filtered = documents.filter(
    (doc) =>
      (catFilter.length === 0 || catFilter.includes(doc.doc_type)) &&
      (searchTerm === "" ||
        doc.name.toLowerCase().includes(searchTerm) ||
        (doc.notes ?? "").toLowerCase().includes(searchTerm))
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15"
        />
      </div>

      <div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            catFilter.length > 0 ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
          }`}
        >
          <Filter size={13} /> {t("expense_filters")}{catFilter.length > 0 ? ` (${catFilter.length})` : ""}
        </button>
        {showFilters && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-fleet-ink">{t("category")}</div>
              <div className="flex flex-wrap gap-1.5">
                {DOC_TYPES.map((k) => (
                  <button
                    key={k}
                    onClick={() => toggleCatFilter(k)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                      catFilter.includes(k) ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border"
                    }`}
                  >
                    {t(DOC_TYPE_LABEL_KEYS[k])}
                  </button>
                ))}
              </div>
            </div>
            {catFilter.length > 0 && (
              <button onClick={() => setCatFilter([])} className="w-fit text-xs text-fleet-coral">
                {t("expense_filters_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_documents")}</p>
      )}
      {filtered.map((doc) =>
        editingId === doc.id ? (
          <div key={doc.id} className="rounded-xl border border-fleet-border bg-white p-4">
            <form
              action={async (formData) => {
                await updateDocument(boatId, doc.id, formData);
                setEditingId(null);
              }}
              className="flex flex-col gap-3"
            >
              <input name="name" defaultValue={doc.name} placeholder={t("doc_name")} className={inputClass} />
              <select name="doc_type" defaultValue={doc.doc_type} className={inputClass}>
                <option value="charter_license">{t("doc_charter_license")}</option>
                <option value="company_docs">{t("doc_company_docs")}</option>
                <option value="myba_contract">{t("doc_myba_contract")}</option>
                <option value="bank">{t("doc_bank")}</option>
                <option value="insurance">{t("doc_insurance")}</option>
                <option value="safety">{t("doc_safety")}</option>
                <option value="other">{t("doc_other")}</option>
              </select>
              <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                {t("expiry_date")}
                <DateInput name="expiry_date" defaultValue={doc.expiry_date ?? undefined} locale={locale} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                {t("notes_field")}
                <textarea name="notes" rows={2} defaultValue={doc.notes ?? ""} className={inputClass} />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
                >
                  {t("close_word")}
                </button>
                <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
                  {t("save_word")}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div
            key={doc.id}
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border p-3 ${
              isDocumentExpiringSoon(doc.expiry_date) ? "bg-fleet-coral/5" : "bg-white"
            }`}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
              <FileText size={18} className="text-fleet-brass" />
            </div>
            <div className="min-w-[140px] flex-1">
              <div className="text-sm font-semibold">
                {doc.name.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                  ? `${t("doc_myba_contract")} - ${doc.name.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                  : doc.name}
              </div>
              <div className="text-xs text-fleet-ink">
                {doc.expiry_date ? (
                  <span className={isDocumentExpiringSoon(doc.expiry_date) ? "font-medium text-fleet-coral" : undefined}>
                    <span dir="ltr">{formatDateDisplay(doc.expiry_date)}</span>
                    {isDocumentExpiringSoon(doc.expiry_date) ? ` (${t("expiring_soon")})` : ""}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              {doc.notes && <div className="mt-0.5 text-xs text-fleet-ink">{doc.notes}</div>}
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge value={doc.doc_type} locale={locale} />
                <span
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    isDocumentExpired(doc.expiry_date) ? "text-fleet-coral bg-fleet-coral/15" : "text-fleet-moss bg-fleet-moss/15"
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
              className="flex h-9 w-9 items-center justify-center text-fleet-brass hover:text-fleet-navy disabled:opacity-50"
            >
              <Share2 size={16} className={sharingId === doc.id ? "animate-pulse" : undefined} />
            </button>
            {canEdit && (
              <>
                {isManagement && doc.status === "pending" && (
                  <form action={approveDocument.bind(null, boatId, doc.id)}>
                    <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                      {t("approve")}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(doc.id)}
                  aria-label="edit"
                  className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                >
                  <Pencil size={16} />
                </button>
                <form action={deleteDocument.bind(null, boatId, doc.id, doc.file_path)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("delete_doc_confirm")}
                    className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral"
                  >
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
