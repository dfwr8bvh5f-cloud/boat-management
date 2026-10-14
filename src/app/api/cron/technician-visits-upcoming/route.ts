import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCaptain } from "@/lib/push";
import { todayLocalISO, addDaysISO, athensLocalHour } from "@/lib/date-format";
import { technicianVisitPushContent } from "@/lib/technician-visit-push";

export const dynamic = "force-dynamic";

// Fires once, at a fixed UTC time (see vercel.json) chosen to sit halfway
// between what 16:00 Athens time is in winter (14:00 UTC, EET/UTC+2) and
// summer (13:00 UTC, EEST/UTC+3) - same reasoning as cron/trip-turnover's
// own comment. Worst-case drift from real local 16:00 is ~30min either way
// across the year. The actual Athens local hour reached is still logged
// below for visibility.

// A week-before and a day-before heads-up for an upcoming technician visit,
// on top of the existing morning-of/evening-before reminders
// (cron/technician-visits-morning, cron/technician-visits-evening). Both
// offsets fire from this one route since they share the same fixed send
// time - unlike the morning/evening pair, neither needs its own cron entry.
// Matched by the visit's own start_date (not range containment like the
// morning/evening ones) - a multi-day visit should only get one "a week
// away" / "tomorrow" heads-up, tied to when it actually starts, not one per
// day it spans.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/technician-visits-upcoming] rejected: missing or wrong CRON_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = todayLocalISO();
  const weekAheadDate = addDaysISO(today, 7);
  const dayAheadDate = addDaysISO(today, 1);
  console.log(
    `[cron/technician-visits-upcoming] running for week-ahead=${weekAheadDate} day-ahead=${dayAheadDate} (Athens local hour: ${athensLocalHour()})`
  );

  const { data: visits } = await supabase
    .from("technician_visits")
    .select("id, technician_name, start_date, start_time")
    .in("start_date", [weekAheadDate, dayAheadDate]);

  const visitIds = (visits ?? []).map((v) => v.id);
  const [{ data: visitBoats }, { data: boats }] = await Promise.all([
    visitIds.length > 0
      ? supabase.from("technician_visit_boats").select("visit_id, boat_id").in("visit_id", visitIds)
      : Promise.resolve({ data: [] }),
    supabase.from("boats").select("id, name"),
  ]);
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  console.log(`[cron/technician-visits-upcoming] found ${visits?.length ?? 0} visit(s) starting on either target date`);

  const notificationsSent: string[] = [];

  for (const v of visits ?? []) {
    const offset = v.start_date === weekAheadDate ? "week" : "day";
    const boatIds = (visitBoats ?? []).filter((vb) => vb.visit_id === v.id).map((vb) => vb.boat_id);
    for (const boatId of boatIds) {
      const boatName = boatNameById.get(boatId) ?? "";
      const time = v.start_time ? v.start_time.slice(0, 5) : null;
      try {
        const result = await sendPushToBoatCaptain(
          boatId,
          technicianVisitPushContent(offset, v.technician_name, boatName, time, `/boats/${boatId}/bookings`),
          `tech-visit-upcoming:${v.id}:${boatId}`
        );
        notificationsSent.push(`${v.id}:${boatId} (${result.delivered}/${result.targetedDevices} delivered)`);
      } catch (e) {
        console.error(`[cron/technician-visits-upcoming] push failed for visit ${v.id} / boat ${boatId}:`, e);
      }
    }
  }

  console.log(`[cron/technician-visits-upcoming] finished: ${notificationsSent.length} notification(s) processed`);
  return NextResponse.json({ ok: true, sent: notificationsSent });
}
