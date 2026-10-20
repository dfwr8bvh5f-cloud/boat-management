import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { SalariesManager } from "@/components/salaries-manager";
import { todayLocalISO } from "@/lib/date-format";

export default async function SalariesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const { month: monthParam } = await searchParams;
  const periodMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : `${todayLocalISO().slice(0, 7)}-01`;

  const supabase = await createClient();
  const [{ data: staff }, { data: mysStaff }, { data: boats }, { data: periods }, { data: loans }] = await Promise.all([
    supabase.from("staff").select("*").order("name"),
    supabase.from("mys_staff").select("*").order("name"),
    supabase.from("boats").select("id, name"),
    supabase.from("salary_periods").select("*").eq("period_month", periodMonth),
    supabase.from("staff_loans").select("*").order("loan_date", { ascending: false }),
  ]);

  const loanIds = (loans ?? []).map((l) => l.id);
  const { data: repayments } =
    loanIds.length > 0
      ? await supabase.from("staff_loan_repayments").select("*").in("loan_id", loanIds)
      : { data: [] };

  return (
    <SalariesManager
      locale={locale}
      periodMonth={periodMonth}
      staff={staff ?? []}
      mysStaff={mysStaff ?? []}
      boats={boats ?? []}
      periods={periods ?? []}
      loans={loans ?? []}
      repayments={repayments ?? []}
    />
  );
}
