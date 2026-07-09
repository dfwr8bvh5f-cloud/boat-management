import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAll, sendPushToBoatCrew } from "@/lib/push";
import { todayLocalISO } from "@/lib/date-format";

export const dynamic = "force-dynamic";

function daysFromNowISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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

  const in30 = daysFromNowISO(30);
  const in3 = daysFromNowISO(3);
  const today = todayLocalISO();

  const [
    { data: expiringDocs },
    { data: boats },
    { data: staffAll },
    { data: guestsAll },
    { data: bookingsAll },
    { data: otherEntriesToday },
  ] = await Promise.all([
    supabase.from("documents").select("name, expiry_date, boat_id").in("expiry_date", [in30, in3]),
    supabase.from("boats").select("id, name"),
    supabase.from("staff").select("name, date_of_birth, boat_id").eq("status", "approved").not("date_of_birth", "is", null),
    supabase.from("booking_guests").select("name, date_of_birth, boat_id, booking_id").not("date_of_birth", "is", null),
    supabase.from("bookings").select("id, start_date, end_date, status"),
    supabase.from("bookings").select("boat_id, usage_type_other").eq("start_date", today).eq("usage_type", "other"),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  for (const doc of expiringDocs ?? []) {
    const boatName = boatNameById.get(doc.boat_id) ?? "";
    const daysLeft = doc.expiry_date === in3 ? 3 : 30;
    await sendPushToAll({
      title: "מסמך עומד לפוג",
      body: `${doc.name} (${boatName}) פג תוקף בעוד ${daysLeft} ימים`,
      url: `/boats/${doc.boat_id}/documents`,
    });
    notificationsSent.push(`doc:${doc.name}`);
  }

  for (const b of otherEntriesToday ?? []) {
    if (!b.usage_type_other) continue;
    const boatName = boatNameById.get(b.boat_id) ?? "";
    await sendPushToBoatCrew(b.boat_id, {
      title: b.usage_type_other,
      body: `אירוע ביומן היום · ${boatName}`,
      url: `/boats/${b.boat_id}/bookings`,
    });
    notificationsSent.push(`other:${b.usage_type_other}`);
  }

  const todayMonthDay = today.slice(5);

  for (const s of staffAll ?? []) {
    if (!s.date_of_birth || s.date_of_birth.slice(5) !== todayMonthDay) continue;
    const boatName = boatNameById.get(s.boat_id) ?? "";
    await sendPushToAll({
      title: "יום הולדת לאיש צוות",
      body: `${s.name} (${boatName}) חוגג/ת יום הולדת היום`,
      url: `/boats/${s.boat_id}/staff`,
    });
    notificationsSent.push(`birthday-staff:${s.name}`);
  }

  const bookingById = new Map((bookingsAll ?? []).map((b) => [b.id, b]));
  for (const g of guestsAll ?? []) {
    if (!g.date_of_birth || g.date_of_birth.slice(5) !== todayMonthDay) continue;
    const booking = bookingById.get(g.booking_id);
    if (!booking || booking.status !== "approved") continue;
    if (today < booking.start_date || today > booking.end_date) continue;
    const boatName = boatNameById.get(g.boat_id) ?? "";
    await sendPushToAll({
      title: "יום הולדת בטיול",
      body: `${g.name} (${boatName}) חוגג/ת יום הולדת היום, באמצע הטיול`,
      url: `/boats/${g.boat_id}/bookings`,
    });
    notificationsSent.push(`birthday-guest:${g.name}`);
  }

  return NextResponse.json({ ok: true, sent: notificationsSent });
}
