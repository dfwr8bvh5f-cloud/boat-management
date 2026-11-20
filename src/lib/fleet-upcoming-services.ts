import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { hoursUntilService, isServiceTrackedMachine, serviceStatus } from "@/lib/engine-service";
import type { Database } from "@/lib/types/database";

export type UpcomingService = {
  specId: string;
  boatId: string;
  boatName: string;
  machineName: string;
  hours: number;
  // Hours left until the next 250h service (0 = due now).
  remaining: number;
  weekOf: string;
};

// Engines/generators across the fleet whose latest weekly-report hour reading
// puts the next 250h service within the warning window (same rule as the
// weekly report form: serviceStatus). Purely derived from what captains
// reported - nothing is estimated for a machine with no report. Soonest first.
export async function getFleetUpcomingServices(
  supabase: SupabaseClient<Database>,
  boats: { id: string; name: string; status?: string | null }[]
): Promise<UpcomingService[]> {
  const activeBoats = boats.filter((b) => b.status !== "inactive");
  const boatNameById = new Map(activeBoats.map((b) => [b.id, b.name]));
  if (boatNameById.size === 0) return [];

  const [specsRaw, reports] = await Promise.all([
    fetchAllRows<{ id: string; boat_id: string; name: string }>((from, to) =>
      supabase
        .from("technical_specs")
        .select("id, boat_id, name")
        .in("category", ["machine", "other"])
        .eq("status", "approved")
        .range(from, to)
    ),
    fetchAllRows<{ id: string; week_of: string }>((from, to) =>
      supabase.from("weekly_engine_reports").select("id, week_of").range(from, to)
    ),
  ]);

  const specs = specsRaw.filter((s) => boatNameById.has(s.boat_id) && isServiceTrackedMachine(s.name));
  if (specs.length === 0 || reports.length === 0) return [];
  const specById = new Map(specs.map((s) => [s.id, s]));
  const weekOfByReportId = new Map(reports.map((r) => [r.id, r.week_of]));

  const entries = await fetchAllRows<{ technical_spec_id: string; hours: number | null; report_id: string }>((from, to) =>
    supabase.from("weekly_engine_report_entries").select("technical_spec_id, hours, report_id").range(from, to)
  );

  const latest = new Map<string, { hours: number; weekOf: string }>();
  for (const e of entries) {
    const weekOf = weekOfByReportId.get(e.report_id);
    if (e.hours == null || !weekOf || !specById.has(e.technical_spec_id)) continue;
    const cur = latest.get(e.technical_spec_id);
    if (!cur || weekOf > cur.weekOf) latest.set(e.technical_spec_id, { hours: e.hours, weekOf });
  }

  const out: UpcomingService[] = [];
  for (const [specId, l] of latest) {
    if (!serviceStatus(l.hours)) continue;
    const remaining = hoursUntilService(l.hours);
    const spec = specById.get(specId)!;
    if (remaining == null) continue;
    out.push({
      specId,
      boatId: spec.boat_id,
      boatName: boatNameById.get(spec.boat_id) ?? "",
      machineName: spec.name,
      hours: l.hours,
      remaining,
      weekOf: l.weekOf,
    });
  }
  return out.sort((a, b) => a.remaining - b.remaining || a.boatName.localeCompare(b.boatName));
}
