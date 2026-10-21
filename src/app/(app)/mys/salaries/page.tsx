import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";
import { SalariesManager } from "@/components/salaries-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { todayLocalISO } from "@/lib/date-format";
import { DEMO_EMAIL } from "@/lib/demo";

export default async function MysSalariesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const { month: monthParam } = await searchParams;
  const periodMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : `${todayLocalISO().slice(0, 7)}-01`;

  const supabase = await createClient();
  const [{ data: staff }, { data: mysStaff }, { data: boats }, { data: periods }, { data: loans }, { data: demoProfile }] =
    await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("mys_staff").select("*").order("name"),
      // Boats that are out of the fleet (status "inactive", e.g. sold/retired
      // boats like STAMER) never need a payroll row - excluded here, not
      // just hidden in the UI, so their crew never even appear.
      supabase.from("boats").select("id, name").neq("status", "inactive"),
      supabase.from("salary_periods").select("*").eq("period_month", periodMonth),
      supabase.from("staff_loans").select("*").order("loan_date", { ascending: false }),
      // The public demo boat (JULIANA) is a fake showcase boat, not a real
      // payroll obligation - excluded by resolving its id from the demo
      // account's own profile rather than hardcoding a boat name.
      supabase.from("profiles").select("boat_id").eq("email", DEMO_EMAIL).maybeSingle(),
    ]);

  const loanIds = (loans ?? []).map((l) => l.id);
  const { data: repayments } =
    loanIds.length > 0
      ? await supabase.from("staff_loan_repayments").select("*").in("loan_id", loanIds)
      : { data: [] };

  const demoBoatId = demoProfile?.boat_id ?? null;
  const visibleBoats = (boats ?? []).filter((b) => b.id !== demoBoatId);

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <SalariesManager
        locale={locale}
        periodMonth={periodMonth}
        staff={staff ?? []}
        mysStaff={mysStaff ?? []}
        boats={visibleBoats}
        periods={periods ?? []}
        loans={loans ?? []}
        repayments={repayments ?? []}
      />
    </div>
  );
}
