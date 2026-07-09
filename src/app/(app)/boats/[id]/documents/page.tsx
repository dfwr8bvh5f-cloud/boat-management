import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/actions/documents";
import { DocumentsTable } from "@/components/documents-table";
import { DateInput } from "@/components/date-input";
import { Lock } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

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
            <tr className="border-b border-fleet-border text-fleet-ink">
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("doc_category")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("expiry_date")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status_word")}</th>
              <th className="px-4 py-3 font-medium" />
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <DocumentsTable
            boatId={boat.id}
            documents={documents ?? []}
            canEdit={canEdit}
            isManagement={isManagement}
            boatType={boat.boat_type}
            locale={locale}
          />
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
            <option value="company_docs">{t("doc_company_docs")}</option>
            <option value="bank">{t("doc_bank")}</option>
            {boat.boat_type === "private" && <option value="charter_license">{t("doc_charter_license")}</option>}
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
