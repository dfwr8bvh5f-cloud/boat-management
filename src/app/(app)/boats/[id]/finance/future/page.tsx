import { redirect } from "next/navigation";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { FutureIncomeManager, type FutureIncomeRow } from "@/components/future-income-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function FutureIncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  if (boat.boat_type === "private") redirect(`/boats/${boat.id}/finance`);
  const isManagement = profile.role === "management";
  const { locale } = await getTranslator();

  const supabase = await createClient();
  const { data: incomes } = await supabase
    .from("incomes")
    .select("*")
    .eq("boat_id", boat.id)
    .eq("type", "future")
    .order("income_date");

  const documentIds = [...new Set((incomes ?? []).flatMap((i) => (i.contract_document_id ? [i.contract_document_id] : [])))];
  const { data: contractDocs } = documentIds.length
    ? await supabase.from("documents").select("id, file_path").in("id", documentIds)
    : { data: [] };
  const filePathById = new Map((contractDocs ?? []).map((d) => [d.id, d.file_path]));
  const urlByPath = await getCachedSignedUrls(
    "documents",
    [...filePathById.values()]
  );

  const rows: FutureIncomeRow[] = (incomes ?? []).map((i) => {
    const path = i.contract_document_id ? filePathById.get(i.contract_document_id) : undefined;
    return { ...i, contractUrl: path ? (urlByPath.get(path) ?? null) : null };
  });

  return (
    <FutureIncomeManager
      boatId={boat.id}
      incomes={rows}
      vatRate={boat.charter_vat_rate}
      isManagement={isManagement}
      canEdit={canEdit}
      locale={locale}
    />
  );
}
