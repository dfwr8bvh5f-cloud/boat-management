import type { SupabaseClient } from "@supabase/supabase-js";
import type { MachineHours } from "@/components/issues-print-document";

// Everything the client-facing technical report needs beyond the issues
// themselves: the latest recorded hours per machine (weekly engine reports,
// same lookup as the Technical Specs page) and the latest non-empty fuel
// status from those weekly reports.
export async function getIssuesReportExtras(
  supabase: SupabaseClient,
  boatId: string
): Promise<{ machines: MachineHours[]; fuel: { status: string; weekOf: string } | null }> {
  const [{ data: specs }, { data: reports }] = await Promise.all([
    supabase.from("technical_specs").select("id, name").eq("boat_id", boatId).eq("category", "machine").eq("status", "approved").order("name"),
    supabase.from("weekly_engine_reports").select("id, week_of, fuel_status").eq("boat_id", boatId).order("week_of", { ascending: false }),
  ]);

  // Gearbox hours aren't tracked in the weekly report (see the reports page).
  const specList = ((specs ?? []) as { id: string; name: string }[]).filter((s) => !s.name.trim().toLowerCase().startsWith("gearbox"));
  const reportRows = (reports ?? []) as { id: string; week_of: string; fuel_status: string | null }[];
  const weekOfByReportId = new Map(reportRows.map((r) => [r.id, r.week_of]));

  const { data: entries } = specList.length
    ? await supabase
        .from("weekly_engine_report_entries")
        .select("technical_spec_id, hours, report_id")
        .in("technical_spec_id", specList.map((s) => s.id))
    : { data: [] };

  const latestBySpec = new Map<string, { hours: number; weekOf: string }>();
  for (const e of (entries ?? []) as { technical_spec_id: string; hours: number | null; report_id: string }[]) {
    const weekOf = weekOfByReportId.get(e.report_id);
    if (e.hours == null || !weekOf) continue;
    const cur = latestBySpec.get(e.technical_spec_id);
    if (!cur || weekOf > cur.weekOf) latestBySpec.set(e.technical_spec_id, { hours: e.hours, weekOf });
  }
  const machines = specList.flatMap((s) => {
    const latest = latestBySpec.get(s.id);
    return latest ? [{ name: s.name, hours: latest.hours, weekOf: latest.weekOf }] : [];
  });

  // reportRows is newest-first, so the first non-empty fuel status is the latest.
  const fuelRow = reportRows.find((r) => r.fuel_status && r.fuel_status.trim() !== "");
  return { machines, fuel: fuelRow ? { status: fuelRow.fuel_status!.trim(), weekOf: fuelRow.week_of } : null };
}
