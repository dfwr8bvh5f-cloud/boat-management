import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { DocumentsTable } from "@/components/documents-table";
import { DocumentsCards } from "@/components/documents-cards";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { Lock } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

// Matches the order categories appear in the upload/edit dropdowns; any
// legacy value no longer offered there (license, registration, safety)
// sorts after everything else instead of disappearing.
const DOC_TYPE_ORDER: Record<string, number> = {
  charter_license: 0,
  company_docs: 1,
  myba_contract: 2,
  bank: 3,
  insurance: 4,
  other: 5,
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const { data: documentsRaw } = await supabase
    .from("documents")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  // Group by category (Array.sort is stable, so the created_at-descending
  // order from the query is preserved within each category).
  const documents = (documentsRaw ?? [])
    .slice()
    .sort((a, b) => (DOC_TYPE_ORDER[a.doc_type] ?? 99) - (DOC_TYPE_ORDER[b.doc_type] ?? 99));

  return (
    <div className="flex flex-col gap-6">
      {profile.role === "owner" && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
          <Lock size={13} /> {t("locked_documents")}
        </div>
      )}
      <div className="sm:hidden">
        <DocumentsCards
          boatId={boat.id}
          documents={documents}
          canEdit={canEdit}
          isManagement={isManagement}
          locale={locale}
        />
      </div>

      <div className="hidden max-w-full self-start overflow-x-auto rounded-xl border border-fleet-border bg-white sm:block">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-fleet-border text-fleet-ink">
              <th className="whitespace-nowrap px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="whitespace-nowrap px-4 py-3 text-start font-medium">{t("doc_category")}</th>
              <th className="whitespace-nowrap px-4 py-3 text-start font-medium">{t("expiry_date")}</th>
              <th className="whitespace-nowrap px-4 py-3 text-start font-medium">{t("status_word")}</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <DocumentsTable
            boatId={boat.id}
            documents={documents}
            canEdit={canEdit}
            isManagement={isManagement}
            locale={locale}
          />
        </table>
      </div>

      {canEdit && <DocumentUploadForm boatId={boat.id} locale={locale} />}
    </div>
  );
}
