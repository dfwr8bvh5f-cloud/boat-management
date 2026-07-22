import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAll, sendPushToBoatCrew } from "@/lib/push";
import { todayLocalISO } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";

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
    console.error("[cron/notifications] rejected: missing or wrong CRON_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const notificationsSent: string[] = [];

  const in30 = daysFromNowISO(30);
  const in3 = daysFromNowISO(3);
  const today = todayLocalISO();
  console.log(`[cron/notifications] running for ${today}`);

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

  console.log(
    `[cron/notifications] found ${expiringDocs?.length ?? 0} expiring docs, ${otherEntriesToday?.length ?? 0} calendar events today`
  );

  for (const doc of expiringDocs ?? []) {
    const boatName = boatNameById.get(doc.boat_id) ?? "";
    const daysLeft = doc.expiry_date === in3 ? 3 : 30;
    const result = await sendPushToAll(
      (locale) => ({
        title: translate(locale, "push_doc_expiring_title"),
        body: translate(locale, "push_doc_expiring_body", { name: doc.name, boat: boatName, days: daysLeft }),
        url: `/boats/${doc.boat_id}/documents`,
      }),
      `doc-expiring:${doc.name}`
    );
    notificationsSent.push(`doc:${doc.name} (${result.delivered}/${result.targetedDevices} delivered)`);
  }

  for (const b of otherEntriesToday ?? []) {
    if (!b.usage_type_other) continue;
    const boatName = boatNameById.get(b.boat_id) ?? "";
    const result = await sendPushToBoatCrew(
      b.boat_id,
      (locale) => ({
        title: b.usage_type_other!,
        body: translate(locale, "push_calendar_event_body", { boat: boatName }),
        url: `/boats/${b.boat_id}/bookings`,
      }),
      `calendar-other:${b.usage_type_other}`
    );
    notificationsSent.push(`other:${b.usage_type_other} (${result.delivered}/${result.targetedDevices} delivered)`);
  }

  const todayMonthDay = today.slice(5);

  for (const s of staffAll ?? []) {
    if (!s.date_of_birth || s.date_of_birth.slice(5) !== todayMonthDay) continue;
    const boatName = boatNameById.get(s.boat_id) ?? "";
    const result = await sendPushToAll(
      (locale) => ({
        title: translate(locale, "push_birthday_staff_title"),
        body: translate(locale, "push_birthday_staff_body", { name: s.name, boat: boatName }),
        url: `/boats/${s.boat_id}/staff`,
      }),
      `birthday-staff:${s.name}`
    );
    notificationsSent.push(`birthday-staff:${s.name} (${result.delivered}/${result.targetedDevices} delivered)`);
  }

  const bookingById = new Map((bookingsAll ?? []).map((b) => [b.id, b]));
  for (const g of guestsAll ?? []) {
    if (!g.date_of_birth || g.date_of_birth.slice(5) !== todayMonthDay) continue;
    const booking = bookingById.get(g.booking_id);
    if (!booking || booking.status !== "approved") continue;
    if (today < booking.start_date || today > booking.end_date) continue;
    const boatName = boatNameById.get(g.boat_id) ?? "";
    const result = await sendPushToAll(
      (locale) => ({
        title: translate(locale, "push_birthday_guest_title"),
        body: translate(locale, "push_birthday_guest_body", { name: g.name, boat: boatName }),
        url: `/boats/${g.boat_id}/bookings`,
      }),
      `birthday-guest:${g.name}`
    );
    notificationsSent.push(`birthday-guest:${g.name} (${result.delivered}/${result.targetedDevices} delivered)`);
  }

  console.log(`[cron/notifications] finished: ${notificationsSent.length} notification(s) processed`);
  return NextResponse.json({ ok: true, sent: notificationsSent });
}
