import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCaptain } from "@/lib/push";
import { todayLocalISO, athensLocalHour } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

// Fires once, at a fixed UTC time (see vercel.json) chosen to sit halfway
// between what 07:00 Athens time is in winter (05:00 UTC, EET/UTC+2) and
// summer (04:00 UTC, EEST/UTC+3) - same reasoning as cron/trip-turnover's
// own comment. Worst-case drift from real local 07:00 is ~30min either way
// across the year. The actual Athens local hour reached is still logged
// below for visibility.

// Morning-of reminder for today's technician visits - the evening-before
// reminder (cron/technician-visits-evening) is a separate route since each
// needs its own fixed fire time, not something one daily cron can do twice.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/technician-visits-morning] rejected: missing or wrong CRON_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = todayLocalISO();
  console.log(`[cron/technician-visits-morning] running for ${today} (Athens local hour: ${athensLocalHour()})`);

  const { data: visits } = await supabase
    .from("technician_visits")
    .select("id, technician_name, start_time")
    .lte("start_date", today)
    .gte("end_date", today);

  const visitIds = (visits ?? []).map((v) => v.id);
  const [{ data: visitBoats }, { data: boats }] = await Promise.all([
    visitIds.length > 0
      ? supabase.from("technician_visit_boats").select("visit_id, boat_id").in("visit_id", visitIds)
      : Promise.resolve({ data: [] }),
    supabase.from("boats").select("id, name"),
  ]);
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  console.log(`[cron/technician-visits-morning] found ${visits?.length ?? 0} visit(s) covering ${today}`);

  const notificationsSent: string[] = [];

  for (const v of visits ?? []) {
    const boatIds = (visitBoats ?? []).filter((vb) => vb.visit_id === v.id).map((vb) => vb.boat_id);
    for (const boatId of boatIds) {
      const boatName = boatNameById.get(boatId) ?? "";
      const time = v.start_time ? v.start_time.slice(0, 5) : null;
      try {
        const result = await sendPushToBoatCaptain(
          boatId,
          (locale) => ({
            title: translate(locale, "push_tech_visit_morning_title"),
            body: [v.technician_name, boatName, time ?? translate(locale, "push_tech_visit_no_time")].filter(Boolean).join(" · "),
            url: `/boats/${boatId}/bookings`,
          }),
          `tech-visit-morning:${v.id}:${boatId}`
        );
        notificationsSent.push(`${v.id}:${boatId} (${result.delivered}/${result.targetedDevices} delivered)`);
      } catch (e) {
        console.error(`[cron/technician-visits-morning] push failed for visit ${v.id} / boat ${boatId}:`, e);
      }
    }
  }

  console.log(`[cron/technician-visits-morning] finished: ${notificationsSent.length} notification(s) processed`);
  return NextResponse.json({ ok: true, sent: notificationsSent });
}
