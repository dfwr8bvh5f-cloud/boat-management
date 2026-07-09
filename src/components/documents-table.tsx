"use client";

import { useState } from "react";
import { Pencil, Trash2, Eye, Download } from "lucide-react";
import { updateDocument, deleteDocument, approveDocument } from "@/lib/actions/documents";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { MYBA_CONTRACT_NAME_PREFIX } from "@/lib/balances";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatDocument, BoatType } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return days < 30;
}

// A document with no expiry date (e.g. company/bank documents) never
// expires, so it's always valid.
function isExpired(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

export function DocumentsTable({
  boatId,
  documents,
  canEdit,
  isManagement,
  boatType,
  locale,
}: {
  boatId: string;
  documents: BoatDocument[];
  canEdit: boolean;
  isManagement: boolean;
  boatType: BoatType;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editingId, setEditingId] = useState<string | null>(null);
  const colCount = canEdit ? 6 : 5;

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
                  <option value="company_docs">{t("doc_company_docs")}</option>
                  <option value="bank">{t("doc_bank")}</option>
                  {boatType === "private" && <option value="charter_license">{t("doc_charter_license")}</option>}
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
          <tr key={doc.id} className="border-b border-fleet-border last:border-0">
            <td className="px-4 py-3 font-bold text-fleet-navy">
              {doc.name.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                ? `${t("doc_myba_contract")} - ${doc.name.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                : doc.name}
            </td>
            <td className="px-4 py-3">
              <StatusBadge value={doc.doc_type} locale={locale} />
            </td>
            <td className="px-4 py-3">
              {doc.expiry_date ? (
                <span className={isExpiringSoon(doc.expiry_date) ? "font-medium text-fleet-coral" : "text-fleet-ink"}>
                  <span dir="ltr">{formatDateDisplay(doc.expiry_date)}</span>
                  {isExpiringSoon(doc.expiry_date) ? ` (${t("expiring_soon")})` : ""}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  isExpired(doc.expiry_date) ? "text-fleet-coral bg-fleet-coral/15" : "text-fleet-moss bg-fleet-moss/15"
                }`}
              >
                {isExpired(doc.expiry_date) ? t("doc_not_valid") : t("doc_valid")}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2.5">
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
              </div>
            </td>
            {canEdit && (
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
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
                </div>
              </td>
            )}
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
