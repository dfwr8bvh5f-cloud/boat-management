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

  // A charter row's MYBA contract can be more than one file (0070_document_income_multi.sql
  // lets many documents rows link to one income via income_id, the same
  // shape documents.booking_id already has for bookings) - plus the legacy
  // single contract_document_id column still needs resolving for rows
  // created before that migration.
  const incomeIds = (incomes ?? []).map((i) => i.id);
  const legacyDocIds = [...new Set((incomes ?? []).flatMap((i) => (i.contract_document_id ? [i.contract_document_id] : [])))];

  const [{ data: linkedDocs }, { data: legacyDocs }] = await Promise.all([
    incomeIds.length
      ? supabase.from("documents").select("id, income_id, file_path").in("income_id", incomeIds).order("created_at")
      : Promise.resolve({ data: [] as { id: string; income_id: string | null; file_path: string }[] }),
    legacyDocIds.length
      ? supabase.from("documents").select("id, file_path").in("id", legacyDocIds)
      : Promise.resolve({ data: [] as { id: string; file_path: string }[] }),
  ]);

  const docsByIncomeId = new Map<string, { id: string; file_path: string }[]>();
  for (const d of linkedDocs ?? []) {
    if (!d.income_id) continue;
    const list = docsByIncomeId.get(d.income_id) ?? [];
    list.push({ id: d.id, file_path: d.file_path });
    docsByIncomeId.set(d.income_id, list);
  }
  const legacyPathById = new Map((legacyDocs ?? []).map((d) => [d.id, d.file_path]));

  const allPaths = [...(linkedDocs ?? []).map((d) => d.file_path), ...legacyPathById.values()];
  const urlByPath = await getCachedSignedUrls("documents", [...new Set(allPaths)]);

  const rows: FutureIncomeRow[] = (incomes ?? []).map((i) => {
    const legacyPath = i.contract_document_id ? legacyPathById.get(i.contract_document_id) : undefined;
    const contracts = [
      ...(i.contract_document_id && legacyPath ? [{ id: i.contract_document_id, path: legacyPath }] : []),
      ...(docsByIncomeId.get(i.id) ?? []).map((d) => ({ id: d.id, path: d.file_path })),
    ]
      .map((c) => ({ id: c.id, url: urlByPath.get(c.path) ?? null }))
      .filter((c): c is { id: string; url: string } => c.url !== null);
    return { ...i, contracts };
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
