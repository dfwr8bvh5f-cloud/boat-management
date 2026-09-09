import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MysDebtsManager } from "@/components/mys-debts-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysDebtsPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();

  const [{ data: boats }, { data: charges }, { data: adHocCharges }, { data: invoices }] = await Promise.all([
    supabase.from("boats").select("id, name").order("name"),
    supabase
      .from("expenses")
      .select("id, boat_id, description, amount, expense_date")
      .eq("paid_by", "management")
      .eq("is_payment_plan", false)
      .eq("status", "approved")
      .is("mys_charge_settled_at", null)
      .order("expense_date", { ascending: false }),
    supabase.from("mys_ad_hoc_charges").select("*").eq("status", "unpaid").order("charge_date", { ascending: false }),
    supabase
      .from("mys_invoices")
      .select("id, boat_id, invoice_number, client_name, amount, issued_date, due_date")
      .eq("status", "sent")
      .order("issued_date", { ascending: false }),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const chargesWithBoat = (charges ?? []).map((c) => ({ ...c, boatName: boatNameById.get(c.boat_id) ?? "" }));
  const invoicesWithBoat = (invoices ?? []).map((i) => ({ ...i, boatName: i.boat_id ? (boatNameById.get(i.boat_id) ?? "") : null }));

  return (
    <MysDebtsManager
      boats={boats ?? []}
      charges={chargesWithBoat}
      adHocCharges={adHocCharges ?? []}
      invoices={invoicesWithBoat}
      locale={locale}
    />
  );
}
