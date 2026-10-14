import type { Locale } from "@/lib/i18n/dictionaries";
import { translate } from "@/lib/i18n/translate";
import type { PushPayload } from "@/lib/push";

// Shared by cron/technician-visits-upcoming and the Settings test-push tool
// (sendTestTechnicianVisitPush) - the test tool's preview must build the
// exact same title/body shape the real reminder sends, not a re-typed
// approximation that could silently drift from it.
export function technicianVisitPushContent(
  offset: "week" | "day",
  technicianName: string,
  boatName: string,
  time: string | null,
  url: string
) {
  return (locale: Locale): PushPayload => ({
    title: translate(locale, offset === "week" ? "push_tech_visit_week_before_title" : "push_tech_visit_day_before_title"),
    body: [technicianName, boatName, time ?? translate(locale, "push_tech_visit_no_time")].filter(Boolean).join(" · "),
    url,
  });
}
