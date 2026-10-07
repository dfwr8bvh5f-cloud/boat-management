import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { TechnicianCalendarManager } from "@/components/technician-calendar-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { TechnicianVisit, TechnicianVisitBoat } from "@/lib/types/database";

export default async function TechnicalCalendarPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const locale = await getLocale();
  const supabase = await createClient();

  const [visits, visitBoats, { data: boats }, { data: technicians }] = await Promise.all([
    fetchAllRows<TechnicianVisit>((from, to) =>
      supabase.from("technician_visits").select("*").order("start_date", { ascending: true }).range(from, to)
    ),
    fetchAllRows<TechnicianVisitBoat>((from, to) =>
      supabase.from("technician_visit_boats").select("*").range(from, to)
    ),
    supabase.from("boats").select("id, name").neq("boat_type", "for_sale").order("name"),
    supabase.from("technicians").select("*").order("name"),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const visitsWithBoats = visits.map((v) => {
    const boatIds = visitBoats.filter((vb) => vb.visit_id === v.id).map((vb) => vb.boat_id);
    return {
      ...v,
      boatIds,
      boatNames: boatIds.map((id) => boatNameById.get(id)).filter((n): n is string => Boolean(n)),
    };
  });

  return (
    <TechnicianCalendarManager
      visits={visitsWithBoats}
      boats={(boats ?? []).map((b) => ({ id: b.id, name: b.name }))}
      technicians={technicians ?? []}
      locale={locale}
    />
  );
}
