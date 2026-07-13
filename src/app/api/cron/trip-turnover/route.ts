import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCrew, sendPushToBoatCaptain } from "@/lib/push";
import { todayLocalISO, currentReportWeekFriday } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

// Charters run noon-to-noon (see booking-calendar.tsx's split-day cells) -
// this runs separately from the main daily digest (which fires once in the
// morning) so a start/end notification actually goes out close to the real
// noon turnover instead of hours early, and only to the people who need to
// act on it (management + that boat's captain/owner), not every user.
export async function GET(request: Request) {
  // Fail closed, not open: this route runs on the admin client (bypasses
  // RLS entirely), so a missing CRON_SECRET must refuse every request
  // rather than silently letting anyone trigger it unauthenticated.
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const notificationsSent: string[] = [];
  const today = todayLocalISO();

  // A booking is a real, scheduled trip the moment it's created - "pending"
  // only means management hasn't reviewed it yet, it's still shown on the
  // calendar like any other booking (see bookings-manager.tsx). Gating the
  // turnover push on status === "approved" meant a trip nobody had gotten
  // around to approving yet would silently never notify anyone, so every
  // booking (pending or approved) counts here, same as boat_events already do.
  const [{ data: startingBookings }, { data: endingBookings }, { data: boats }, { data: todaysEvents }] = await Promise.all([
    supabase.from("bookings").select("customer_name, boat_id").eq("start_date", today),
    supabase.from("bookings").select("customer_name, boat_id").eq("end_date", today),
    supabase.from("boats").select("id, name"),
    supabase.from("boat_events").select("title, boat_id").eq("event_date", today),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  for (const b of startingBookings ?? []) {
    const boatName = boatNameById.get(b.boat_id) ?? "";
    await sendPushToBoatCrew(b.boat_id, (locale) => ({
      title: translate(locale, "push_trip_start_title"),
      body: translate(locale, "push_trip_start_body", { customer: b.customer_name, boat: boatName }),
      url: `/boats/${b.boat_id}/bookings`,
    }));
    notificationsSent.push(`start:${b.customer_name}`);
  }

  for (const b of endingBookings ?? []) {
    const boatName = boatNameById.get(b.boat_id) ?? "";
    await sendPushToBoatCrew(b.boat_id, (locale) => ({
      title: translate(locale, "push_trip_end_title"),
      body: translate(locale, "push_trip_end_body", { customer: b.customer_name, boat: boatName }),
      url: `/boats/${b.boat_id}/bookings`,
    }));
    notificationsSent.push(`end:${b.customer_name}`);
  }

  for (const e of todaysEvents ?? []) {
    const boatName = boatNameById.get(e.boat_id) ?? "";
    await sendPushToBoatCrew(e.boat_id, (locale) => ({
      title: translate(locale, "push_event_today_title"),
      body: translate(locale, "push_event_today_body", { title: e.title, boat: boatName }),
      url: `/boats/${e.boat_id}/bookings`,
    }));
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
        await sendPushToBoatCaptain(b.id, (locale) => ({
          title: translate(locale, "push_weekly_reminder_title"),
          body: translate(locale, "push_weekly_reminder_body", { boat: b.name }),
          url: `/boats/${b.id}/maintenance/reports`,
        }));
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
        await sendPushToBoatCaptain(b.id, (locale) => ({
          title: translate(locale, "push_weekly_escalation_title"),
          body: translate(locale, "push_weekly_escalation_body", { boat: b.name }),
          url: `/boats/${b.id}/maintenance/reports`,
        }));
        notificationsSent.push(`weekly-escalation:${b.name}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent: notificationsSent });
}
