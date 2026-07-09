import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCrew } from "@/lib/push";
import { todayLocalISO } from "@/lib/date-format";

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

  return NextResponse.json({ ok: true, sent: notificationsSent });
}
