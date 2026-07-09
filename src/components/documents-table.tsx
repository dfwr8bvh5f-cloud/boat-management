"use client";

import { useState } from "react";
import { Pencil, Trash2, Eye, Download, Share2 } from "lucide-react";
import { updateDocument, deleteDocument, approveDocument } from "@/lib/actions/documents";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { MYBA_CONTRACT_NAME_PREFIX } from "@/lib/balances";
import { formatDateDisplay } from "@/lib/date-format";
import { isDocumentExpiringSoon, isDocumentExpired } from "@/lib/document-status";
import { useDocumentShare } from "@/lib/use-document-share";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatDocument } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-1 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

export function DocumentsTable({
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
  const { sharingId, shareDocument } = useDocumentShare(boatId);
  const colCount = 5;

  return (
    <tbody>
      {documents.map((doc) =>
        editingId === doc.id ? (
          <tr key={doc.id} className="border-b border-fleet-border last:border-0">
            <td colSpan={colCount} className="px-4 py-3">
              <form
                action={async (formData) => {
                  await updateDocument(boatId, doc.id, formData);
                  setEditingId(null);
                }}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
              >
                <input name="name" defaultValue={doc.name} placeholder={t("doc_name")} className={inputClass} />
                <select name="doc_type" defaultValue={doc.doc_type} className={inputClass}>
                  <option value="charter_license">{t("doc_charter_license")}</option>
                  <option value="company_docs">{t("doc_company_docs")}</option>
                  <option value="myba_contract">{t("doc_myba_contract")}</option>
                  <option value="bank">{t("doc_bank")}</option>
                  <option value="insurance">{t("doc_insurance")}</option>
                  <option value="other">{t("doc_other")}</option>
                </select>
                <label className="flex flex-col gap-1 text-xs text-fleet-ink">
                  {t("expiry_date")}
                  <DateInput name="expiry_date" defaultValue={doc.expiry_date ?? undefined} locale={locale} className={inputClass} />
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
            </td>
          </tr>
        ) : (
          <tr
            key={doc.id}
            className={`border-b border-fleet-border last:border-0 ${isDocumentExpiringSoon(doc.expiry_date) ? "bg-fleet-coral/5" : ""}`}
          >
            <td className="px-4 py-3 font-bold text-fleet-navy">
              {doc.name.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                ? `${t("doc_myba_contract")} - ${doc.name.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                : doc.name}
            </td>
            <td className="px-4 py-3">
              <StatusBadge value={doc.doc_type} locale={locale} />
            </td>
            <td className="whitespace-nowrap px-4 py-3">
              {doc.expiry_date ? (
                <span className={isDocumentExpiringSoon(doc.expiry_date) ? "font-medium text-fleet-coral" : "text-fleet-ink"}>
                  <span dir="ltr">{formatDateDisplay(doc.expiry_date)}</span>
                  {isDocumentExpiringSoon(doc.expiry_date) ? ` (${t("expiring_soon")})` : ""}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  isDocumentExpired(doc.expiry_date) ? "text-fleet-coral bg-fleet-coral/15" : "text-fleet-moss bg-fleet-moss/15"
                }`}
              >
                {isDocumentExpired(doc.expiry_date) ? t("doc_not_valid") : t("doc_valid")}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1.5">
                <a
                  href={`/boats/${boatId}/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("doc_view")}
                  title={t("doc_view")}
                  className="text-fleet-brass hover:text-fleet-navy"
                >
                  <Eye size={16} />
                </a>
                <a
                  href={`/boats/${boatId}/documents/${doc.id}/download?download=1`}
                  aria-label={t("manifest_download")}
                  title={t("manifest_download")}
                  className="text-fleet-brass hover:text-fleet-navy"
                >
                  <Download size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => shareDocument(doc)}
                  disabled={sharingId === doc.id}
                  aria-label={t("doc_share")}
                  title={t("doc_share")}
                  className="text-fleet-brass hover:text-fleet-navy disabled:opacity-50"
                >
                  <Share2 size={16} className={sharingId === doc.id ? "animate-pulse" : undefined} />
                </button>
                {canEdit && (
                  <>
                    {isManagement && doc.status === "pending" && (
                      <form action={approveDocument.bind(null, boatId, doc.id)}>
                        <button type="submit" className="text-xs font-medium text-fleet-moss hover:underline">
                          {t("approve")}
                        </button>
                      </form>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(doc.id)}
                      aria-label="edit"
                      className="text-fleet-ink hover:text-fleet-navy"
                    >
                      <Pencil size={15} />
                    </button>
                    <form action={deleteDocument.bind(null, boatId, doc.id, doc.file_path)}>
                      <ConfirmSubmitButton confirmMessage={t("delete_doc_confirm")} className="text-fleet-ink hover:text-fleet-coral">
                        <Trash2 size={15} />
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
            </td>
          </tr>
        )
      )}
      {documents.length === 0 && (
        <tr>
          <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-fleet-ink">
            {t("none_documents")}
          </td>
        </tr>
      )}
    </tbody>
  );
}
