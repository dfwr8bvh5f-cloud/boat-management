import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCaptain } from "@/lib/push";
import { todayLocalISO, addDaysISO, athensLocalHour } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

// Fires once, at a fixed UTC time (see vercel.json) chosen to sit halfway
// between what 19:00 Athens time is in winter (17:00 UTC, EET/UTC+2) and
// summer (16:00 UTC, EEST/UTC+3) - same reasoning as cron/trip-turnover's
// own comment (Vercel's Hobby plan can't run this hourly and check Athens
// local time to land exactly on 19:00). Worst-case drift from real local
// 19:00 is ~30min either way across the year. The actual Athens local hour
// reached is still logged below for visibility.

// Evening-before reminder for tomorrow's technician visits - the morning-of
// reminder (cron/technician-visits-morning) is a separate route since each
// needs its own fixed fire time, not something one daily cron can do twice.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/technician-visits-evening] rejected: missing or wrong CRON_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrow = addDaysISO(todayLocalISO(), 1);
  console.log(`[cron/technician-visits-evening] running for ${tomorrow} (Athens local hour: ${athensLocalHour()})`);

  // A visit can span more than one day (DateRangeCalendar) - matched by
  // range containment, not exact start_date equality, so a multi-day visit
  // still gets an evening-before reminder for each day it continues into.
  const { data: visits } = await supabase
    .from("technician_visits")
    .select("id, technician_name, start_time")
    .lte("start_date", tomorrow)
    .gte("end_date", tomorrow);

  const visitIds = (visits ?? []).map((v) => v.id);
  const [{ data: visitBoats }, { data: boats }] = await Promise.all([
    visitIds.length > 0
      ? supabase.from("technician_visit_boats").select("visit_id, boat_id").in("visit_id", visitIds)
      : Promise.resolve({ data: [] }),
    supabase.from("boats").select("id, name"),
  ]);
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  console.log(`[cron/technician-visits-evening] found ${visits?.length ?? 0} visit(s) covering ${tomorrow}`);

  const notificationsSent: string[] = [];

  // One push per (visit, boat) pair - a visit covering several boats sends
  // one notification per boat, each naming just that boat (same loop shape
  // as cron/notifications' own otherEntriesToday loop). Management is
  // included in every sendPushToBoatCaptain call by design, so a multi-boat
  // visit does mean management sees more than one push for it - an
  // accepted tradeoff for keeping this simple, same as that existing loop.
  for (const v of visits ?? []) {
    const boatIds = (visitBoats ?? []).filter((vb) => vb.visit_id === v.id).map((vb) => vb.boat_id);
    for (const boatId of boatIds) {
      const boatName = boatNameById.get(boatId) ?? "";
      const time = v.start_time ? v.start_time.slice(0, 5) : null;
      try {
        const result = await sendPushToBoatCaptain(
          boatId,
          (locale) => ({
            title: translate(locale, "push_tech_visit_evening_title"),
            body: [v.technician_name, boatName, time ?? translate(locale, "push_tech_visit_no_time")].filter(Boolean).join(" · "),
            url: `/boats/${boatId}/bookings`,
          }),
          `tech-visit-evening:${v.id}:${boatId}`
        );
        notificationsSent.push(`${v.id}:${boatId} (${result.delivered}/${result.targetedDevices} delivered)`);
      } catch (e) {
        console.error(`[cron/technician-visits-evening] push failed for visit ${v.id} / boat ${boatId}:`, e);
      }
    }
  }

  console.log(`[cron/technician-visits-evening] finished: ${notificationsSent.length} notification(s) processed`);
  return NextResponse.json({ ok: true, sent: notificationsSent });
}
