import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysSupplierCommissionsManager } from "@/components/mys-supplier-commissions-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { getTranslator } from "@/lib/i18n/locale";
import { round2 } from "@/lib/money";
import type { MysCommissionPayment } from "@/lib/types/database";

export default async function MysSupplierCommissionsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  // Supplier picker draws from the fleet-wide technicians directory
  // (already the shared "supplier" list used on maintenance issues -
  // src/lib/actions/technicians.ts), not the MYS-only mys_suppliers table,
  // so she only ever maintains one supplier list.
  const [{ data: commissions }, { data: technicians }] = await Promise.all([
    supabase.from("mys_supplier_commissions").select("*").order("created_at", { ascending: false }),
    supabase.from("technicians").select("id, name").order("name"),
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

  const signedUrlByPath = await getCachedSignedUrls("receipts", [
    ...(attachments ?? []).map((a) => a.file_path),
    ...(commissions ?? []).flatMap((c) => (c.commission_invoice_path ? [c.commission_invoice_path] : [])),
  ]);
  const attachmentsByCommissionId = new Map<string, { id: string; url: string; path: string }[]>();
  for (const a of attachments ?? []) {
    const url = signedUrlByPath.get(a.file_path);
    if (!url) continue;
    const arr = attachmentsByCommissionId.get(a.commission_id);
    const entry = { id: a.id, url, path: a.file_path };
    if (arr) arr.push(entry);
    else attachmentsByCommissionId.set(a.commission_id, [entry]);
  }

  // Partial-payment history (see addMysSupplierCommissionPayment,
  // src/lib/actions/mys-commissions.ts) - same shape/role as the invoice/
  // charge payment histories elsewhere in MYS, so the "paid so far"/
  // remaining-balance display here matches those.
  const { data: commissionPayments } =
    commissionIds.length > 0
      ? await supabase.from("mys_commission_payments").select("*").in("commission_id", commissionIds).order("paid_date")
      : { data: [] as MysCommissionPayment[] };
  const paymentsByCommissionId = new Map<string, MysCommissionPayment[]>();
  for (const p of commissionPayments ?? []) {
    const arr = paymentsByCommissionId.get(p.commission_id);
    if (arr) arr.push(p);
    else paymentsByCommissionId.set(p.commission_id, [p]);
  }

  const commissionsWithAttachments = (commissions ?? []).map((c) => {
    const payments = paymentsByCommissionId.get(c.id) ?? [];
    const paidSoFar = round2(payments.reduce((s, p) => s + p.amount, 0));
    return {
      ...c,
      attachments: attachmentsByCommissionId.get(c.id) ?? [],
      commission_invoice_url: (c.commission_invoice_path && signedUrlByPath.get(c.commission_invoice_path)) ?? null,
      payments,
      paidSoFar,
      remainingAmount: round2(c.total_amount - paidSoFar),
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysSupplierCommissionsManager
        commissions={commissionsWithAttachments}
        supplierNames={(technicians ?? []).map((s) => s.name)}
        locale={locale}
      />
    </div>
  );
}
