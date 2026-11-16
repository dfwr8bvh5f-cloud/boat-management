import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Hours per machine from the most recent report BEFORE `weekOf`, used to warn
// when this week's reading is lower than last week's (an hour meter only
// goes up). Empty when there is no earlier report.
export async function previousWeekHoursBySpecId(
  supabase: SupabaseClient<Database>,
  boatId: string,
  weekOf: string
): Promise<Record<string, number>> {
  const { data: previous, error } = await supabase
    .from("weekly_engine_reports")
    .select("id")
    .eq("boat_id", boatId)
    .lt("week_of", weekOf)
    .order("week_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("previousWeekHoursBySpecId: report lookup failed:", error.message);
  if (!previous) return {};

  const { data: entries, error: entriesError } = await supabase
    .from("weekly_engine_report_entries")
    .select("technical_spec_id, hours")
    .eq("report_id", previous.id);
  if (entriesError) console.error("previousWeekHoursBySpecId: entries lookup failed:", entriesError.message);

  const out: Record<string, number> = {};
  for (const e of entries ?? []) if (e.hours != null) out[e.technical_spec_id] = e.hours;
  return out;
}
