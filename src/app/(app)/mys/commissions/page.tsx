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
          .select("id, commission_id, file_path, kind")
          .in("commission_id", commissionIds)
          .order("created_at")
      : { data: [] as { id: string; commission_id: string; file_path: string; kind: "supplier" | "issued" }[] };

  const signedUrlByPath = await getCachedSignedUrls("receipts", (attachments ?? []).map((a) => a.file_path));
  // The supplier's own invoice(s) and the invoice(s) she herself issues to
  // the supplier live in the same table now, split apart here by kind so
  // the pin icon and the issued-invoice icon never mix files up (same
  // pattern the Future income page already uses for MYBA contract vs.
  // invoice - see src/app/(app)/boats/[id]/finance/future/page.tsx).
  const attachmentsByCommissionId = new Map<string, { id: string; url: string; path: string }[]>();
  const issuedInvoicesByCommissionId = new Map<string, { id: string; url: string; path: string }[]>();
  for (const a of attachments ?? []) {
    const url = signedUrlByPath.get(a.file_path);
    if (!url) continue;
    const entry = { id: a.id, url, path: a.file_path };
    const map = a.kind === "issued" ? issuedInvoicesByCommissionId : attachmentsByCommissionId;
    const arr = map.get(a.commission_id);
    if (arr) arr.push(entry);
    else map.set(a.commission_id, [entry]);
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
      issuedInvoices: issuedInvoicesByCommissionId.get(c.id) ?? [],
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
