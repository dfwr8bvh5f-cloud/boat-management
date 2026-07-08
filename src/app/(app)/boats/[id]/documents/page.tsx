import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument, approveDocument } from "@/lib/actions/documents";
import { MYBA_CONTRACT_NAME_PREFIX } from "@/lib/balances";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { Lock, Download, Printer } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return days < 30;
}

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      {profile.role === "owner" && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-xs text-fleet-ink">
          <Lock size={13} /> {t("locked_documents")}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-fleet-border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-fleet-border text-start text-fleet-ink">
              <th className="px-4 py-3 font-medium">{t("name")}</th>
              <th className="px-4 py-3 font-medium">{t("doc_category")}</th>
              <th className="px-4 py-3 font-medium">{t("expiry_date")}</th>
              <th className="px-4 py-3 font-medium">{t("status_word")}</th>
              <th className="px-4 py-3 font-medium" />
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {documents?.map((doc) => (
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
                  <StatusBadge value={doc.status} locale={locale} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <a
                      href={`/boats/${boat.id}/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("export_print")}
                      title={t("export_print")}
                      className="text-fleet-brass hover:text-fleet-navy"
                    >
                      <Printer size={16} />
                    </a>
                    <a
                      href={`/boats/${boat.id}/documents/${doc.id}/download?download=1`}
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
                        <form action={approveDocument.bind(null, boat.id, doc.id)}>
                          <button type="submit" className="text-xs font-medium text-fleet-moss hover:underline">
                            {t("approve")}
                          </button>
                        </form>
                      )}
                      <form action={deleteDocument.bind(null, boat.id, doc.id, doc.file_path)}>
                        <ConfirmSubmitButton
                          confirmMessage={t("delete_doc_confirm")}
                          className="text-xs font-medium text-fleet-coral hover:underline"
                        >
                          {t("delete_word")}
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(!documents || documents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-fleet-ink">
                  {t("none_documents")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          action={uploadDocument.bind(null, boat.id)}
          encType="multipart/form-data"
          className="grid grid-cols-1 gap-4 rounded-xl border border-fleet-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="text-sm font-bold text-fleet-navy sm:col-span-2 lg:col-span-3">
            {t("doc_file_upload")}
          </h2>
          <input name="name" placeholder={t("doc_name")} className={inputClass} />
          <select name="doc_type" defaultValue="other" className={inputClass}>
            <option value="insurance">{t("doc_insurance")}</option>
            <option value="license">{t("doc_license")}</option>
            <option value="registration">{t("doc_registration")}</option>
            <option value="other">{t("doc_other")}</option>
          </select>
          <label className="flex flex-col gap-1 text-xs text-fleet-ink">
            {t("expiry_date")}
            <DateInput name="expiry_date" locale={locale} className={inputClass} />
          </label>
          <input name="file" type="file" required className={`${inputClass} sm:col-span-2 lg:col-span-3`} />
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-fleet-teal px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              {t("save_document")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
