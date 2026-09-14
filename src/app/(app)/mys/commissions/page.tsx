import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysSupplierCommissionsManager } from "@/components/mys-supplier-commissions-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysSupplierCommissionsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: commissions }, { data: suppliers }] = await Promise.all([
    supabase.from("mys_supplier_commissions").select("*").order("created_at", { ascending: false }),
    supabase.from("mys_suppliers").select("id, name").order("name"),
  ]);

  const commissionIds = (commissions ?? []).map((c) => c.id);
  const { data: attachments } =
    commissionIds.length > 0
      ? await supabase
          .from("mys_supplier_commission_attachments")
          .select("id, commission_id, file_path")
          .in("commission_id", commissionIds)
          .order("created_at")
      : { data: [] as { id: string; commission_id: string; file_path: string }[] };

  const signedUrlByPath = await getCachedSignedUrls("receipts", (attachments ?? []).map((a) => a.file_path));
  const attachmentsByCommissionId = new Map<string, { id: string; url: string; path: string }[]>();
  for (const a of attachments ?? []) {
    const url = signedUrlByPath.get(a.file_path);
    if (!url) continue;
    const arr = attachmentsByCommissionId.get(a.commission_id);
    const entry = { id: a.id, url, path: a.file_path };
    if (arr) arr.push(entry);
    else attachmentsByCommissionId.set(a.commission_id, [entry]);
  }

  const commissionsWithAttachments = (commissions ?? []).map((c) => ({
    ...c,
    attachments: attachmentsByCommissionId.get(c.id) ?? [],
  }));

  return (
    <MysSupplierCommissionsManager
      commissions={commissionsWithAttachments}
      supplierNames={(suppliers ?? []).map((s) => s.name)}
      locale={locale}
    />
  );
}
