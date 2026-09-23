import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { DocumentsCards } from "@/components/documents-cards";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { Lock } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

// Matches the order categories appear in the upload/edit dropdowns; any
// legacy value no longer offered there (license, registration) sorts after
// everything else instead of disappearing.
const DOC_TYPE_ORDER: Record<string, number> = {
  charter_license: 0,
  company_docs: 1,
  myba_contract: 2,
  bank: 3,
  insurance: 4,
  safety: 5,
  other: 6,
};

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const [{ data: documentsRaw }, { data: legacyContracts }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("boat_id", boat.id)
      // Any document linked to a charter's future-income row (income_id set -
      // its invoice, or a MYBA contract uploaded from the Future income page
      // rather than manually here) already shows as an icon on that income
      // row (src/components/future-income-manager.tsx) - it doesn't need a
      // second, redundant appearance in the general documents folder. A MYBA
      // contract uploaded directly here, unrelated to any specific charter,
      // has no income_id and still shows normally.
      .is("income_id", null)
      .order("created_at", { ascending: false }),
    // Pre-0070 charter contracts link the other way round (incomes.contract_
    // document_id pointing at the document, instead of documents.income_id
    // pointing at the income) - excluded separately below so those older
    // contracts don't leak into this list either.
    supabase.from("incomes").select("contract_document_id").eq("boat_id", boat.id).not("contract_document_id", "is", null),
  ]);
  const legacyContractIds = new Set(
    (legacyContracts ?? []).flatMap((i) => (i.contract_document_id ? [i.contract_document_id] : []))
  );

  // Group by category (Array.sort is stable, so the created_at-descending
  // order from the query is preserved within each category).
  const documents = (documentsRaw ?? [])
    .filter((d) => !legacyContractIds.has(d.id))
    .slice()
    .sort((a, b) => (DOC_TYPE_ORDER[a.doc_type] ?? 99) - (DOC_TYPE_ORDER[b.doc_type] ?? 99));

  return (
    <div className="flex flex-col gap-6">
      {profile.role === "owner" && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
          <Lock size={14} /> {t("locked_documents")}
        </div>
      )}
      {canEdit && <DocumentUploadForm boatId={boat.id} locale={locale} />}

      <DocumentsCards
        boatId={boat.id}
        documents={documents}
        canEdit={canEdit}
        isManagement={isManagement}
        locale={locale}
      />
    </div>
  );
}
