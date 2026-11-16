import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBoatCaptainOnly } from "@/lib/push";
import { athensLocalHour, athensLocalWeekday, currentReportWeekThursday } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";

// Vercel crons fire at fixed UTC times, but the reminders must land at 12:00
// Athens time all year (10:00 UTC in winter, 09:00 UTC in summer). So vercel.json
// triggers this route at BOTH 09:00 and 10:00 UTC on Thursday and Friday, and
// the route only acts when Athens local time is really 12:xx - the other
// trigger of the pair is a no-op.
//
// Thursday 12:00: every captain gets a push to fill in the weekly report.
// Friday 12:00:   only captains of boats with NO report for this week yet get
//                 a reminder - whoever already submitted is left alone.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/weekly-report] rejected: missing or wrong CRON_SECRET");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hour = athensLocalHour();
  const weekday = athensLocalWeekday(); // 0=Sun..6=Sat
  console.log(`[cron/weekly-report] running: Athens weekday ${weekday}, hour ${hour}`);

  if (hour !== 12 || (weekday !== 4 && weekday !== 5)) {
    return NextResponse.json({ ok: true, skipped: `not Thursday/Friday 12:00 Athens (weekday ${weekday}, hour ${hour})` });
  }

  const supabase = createAdminClient();
  const sent: string[] = [];
  const { data: boats } = await supabase.from("boats").select("id, name").neq("boat_type", "for_sale").neq("status", "inactive");
  const weekOf = currentReportWeekThursday();

  if (weekday === 4) {
    for (const b of boats ?? []) {
      try {
        const result = await sendPushToBoatCaptainOnly(
          b.id,
          (locale) => ({
            title: translate(locale, "push_weekly_reminder_title"),
            body: translate(locale, "push_weekly_reminder_body", { boat: b.name }),
            url: `/boats/${b.id}/maintenance/reports`,
          }),
          `weekly-reminder:${b.name}`
        );
        sent.push(`reminder:${b.name} (${result.delivered}/${result.targetedDevices} delivered)`);
      } catch (e) {
        console.error(`[cron/weekly-report] reminder push failed for ${b.name}:`, e);
      }
    }
  } else {
    const boatIds = (boats ?? []).map((b) => b.id);
    const { data: submitted, error } =
      boatIds.length > 0
        ? await supabase.from("weekly_engine_reports").select("boat_id").eq("week_of", weekOf).in("boat_id", boatIds)
        : { data: [], error: null };
    if (error) {
      // Never fall back to "nobody submitted" on a failed lookup - that would
      // nag captains who already filled the report in.
      console.error("[cron/weekly-report] submitted-reports lookup failed:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const submittedIds = new Set((submitted ?? []).map((r) => r.boat_id));

    for (const b of boats ?? []) {
      if (submittedIds.has(b.id)) continue;
      try {
        const result = await sendPushToBoatCaptainOnly(
          b.id,
          (locale) => ({
            title: translate(locale, "push_weekly_escalation_title"),
            body: translate(locale, "push_weekly_escalation_body", { boat: b.name }),
            url: `/boats/${b.id}/maintenance/reports`,
          }),
          `weekly-escalation:${b.name}`
        );
        sent.push(`escalation:${b.name} (${result.delivered}/${result.targetedDevices} delivered)`);
      } catch (e) {
        console.error(`[cron/weekly-report] escalation push failed for ${b.name}:`, e);
      }
    }
  }

  console.log(`[cron/weekly-report] finished: ${sent.length} notification(s) processed`);
  return NextResponse.json({ ok: true, weekOf, sent });
}
