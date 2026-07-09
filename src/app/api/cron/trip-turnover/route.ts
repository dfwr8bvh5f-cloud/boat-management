import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCrew, sendPushToBoatCaptain } from "@/lib/push";
import { todayLocalISO, currentReportWeekFriday } from "@/lib/date-format";

export const dynamic = "force-dynamic";

// Charters run noon-to-noon (see booking-calendar.tsx's split-day cells) -
// this runs separately from the main daily digest (which fires once in the
// morning) so a start/end notification actually goes out close to the real
// noon turnover instead of hours early, and only to the people who need to
// act on it (management + that boat's captain/owner), not every user.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const notificationsSent: string[] = [];
  const today = todayLocalISO();

  const [{ data: startingBookings }, { data: endingBookings }, { data: boats }, { data: todaysEvents }] = await Promise.all([
    supabase.from("bookings").select("customer_name, boat_id").eq("start_date", today).eq("status", "approved"),
    supabase.from("bookings").select("customer_name, boat_id").eq("end_date", today).eq("status", "approved"),
    supabase.from("boats").select("id, name"),
    supabase.from("boat_events").select("title, boat_id").eq("event_date", today),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  for (const b of startingBookings ?? []) {
    const boatName = boatNameById.get(b.boat_id) ?? "";
    await sendPushToBoatCrew(b.boat_id, {
      title: "טריפ מתחיל היום",
      body: `${b.customer_name} (${boatName}) - הטריפ מתחיל היום ב-12:00`,
      url: `/boats/${b.boat_id}/bookings`,
    });
    notificationsSent.push(`start:${b.customer_name}`);
  }

  for (const b of endingBookings ?? []) {
    const boatName = boatNameById.get(b.boat_id) ?? "";
    await sendPushToBoatCrew(b.boat_id, {
      title: "טריפ מסתיים היום",
      body: `${b.customer_name} (${boatName}) - הטריפ מסתיים היום ב-12:00`,
      url: `/boats/${b.boat_id}/bookings`,
    });
    notificationsSent.push(`end:${b.customer_name}`);
  }

  for (const e of todaysEvents ?? []) {
    const boatName = boatNameById.get(e.boat_id) ?? "";
    await sendPushToBoatCrew(e.boat_id, {
      title: "אירוע היום",
      body: `${e.title} (${boatName})`,
      url: `/boats/${e.boat_id}/bookings`,
    });
    notificationsSent.push(`event:${e.title}`);
  }

  // Weekly engine/generator/watermaker hours + fuel status report: due every
  // Friday. A reminder goes out to captains on Friday itself; anyone who
  // still hasn't submitted gets a second, escalation push the next day
  // (Saturday) - checked against the same week_of the form itself uses.
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const isFriday = weekday === 5;
  const isSaturday = weekday === 6;

  if (isFriday || isSaturday) {
    const { data: fullBoats } = await supabase.from("boats").select("id, name, boat_type").neq("boat_type", "for_sale");
    const weekOf = currentReportWeekFriday();

    if (isFriday) {
      for (const b of fullBoats ?? []) {
        await sendPushToBoatCaptain(b.id, {
          title: "דיווח שבועי - שעות פעולה",
          body: `${b.name} - נא למלא את דיווח השעות השבועי (מנוע, גנרטורים, מתפיל ומצב דלק)`,
          url: `/boats/${b.id}/maintenance/reports`,
        });
        notificationsSent.push(`weekly-reminder:${b.name}`);
      }
    } else if (isSaturday) {
      const boatIds = (fullBoats ?? []).map((b) => b.id);
      const { data: submitted } =
        boatIds.length > 0
          ? await supabase.from("weekly_engine_reports").select("boat_id").eq("week_of", weekOf).in("boat_id", boatIds)
          : { data: [] };
      const submittedIds = new Set((submitted ?? []).map((r) => r.boat_id));

      for (const b of fullBoats ?? []) {
        if (submittedIds.has(b.id)) continue;
        await sendPushToBoatCaptain(b.id, {
          title: "תזכורת: דיווח שבועי לא הוגש",
          body: `${b.name} - עדיין לא מולא דיווח השעות השבועי`,
          url: `/boats/${b.id}/maintenance/reports`,
        });
        notificationsSent.push(`weekly-escalation:${b.name}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: notificationsSent });
}
