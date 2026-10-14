"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireManagement } from "@/lib/auth";
import { sendPushToUser, type PushSendResult } from "@/lib/push";
import { translate } from "@/lib/i18n/translate";
import { technicianVisitPushContent } from "@/lib/technician-visit-push";

export async function savePushSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: profile.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) throw new Error(error.message);
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

// Developer tool (Settings, management only) - sends one real push to a
// single chosen user on demand, so the whole pipeline (VAPID config,
// stored subscription, actual delivery) can be confirmed for a real
// account without waiting for a cron or a real event to trigger it.
// A locale-aware builder, like every other push in the app, not a fixed
// Hebrew payload - confirmed live: a management user with English selected
// as their UI language still received this in Hebrew, since the fixed
// version never looked at the recipient's own profile.locale at all.
export async function sendTestPush(userId: string): Promise<PushSendResult> {
  await requireManagement();
  return sendPushToUser(
    userId,
    (locale) => ({
      title: translate(locale, "push_test_title"),
      body: translate(locale, "push_test_body"),
      url: "/settings",
    }),
    `manual-test:${userId}`
  );
}

// Same dev-tool purpose as sendTestPush above, but previews the week-before/
// day-before technician visit reminder specifically (cron/technician-visits-
// upcoming) - built from the soonest real upcoming visit so the preview
// shows real technician/boat names, or a generic placeholder when there are
// none scheduled at all.
export async function sendTestTechnicianVisitPush(userId: string, offset: "week" | "day"): Promise<PushSendResult> {
  await requireManagement();
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("technician_visits")
    .select("id, technician_name, start_time")
    .gte("start_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  let boatName = "";
  let url = "/technical/calendar";
  if (visit) {
    const { data: link } = await supabase.from("technician_visit_boats").select("boat_id").eq("visit_id", visit.id).limit(1).maybeSingle();
    if (link) {
      const { data: boat } = await supabase.from("boats").select("name").eq("id", link.boat_id).single();
      boatName = boat?.name ?? "";
      url = `/boats/${link.boat_id}/bookings`;
    }
  }

  const technicianName = visit?.technician_name || "Technician";
  const time = visit?.start_time ? visit.start_time.slice(0, 5) : "10:00";

  return sendPushToUser(
    userId,
    technicianVisitPushContent(offset, technicianName, boatName || "Boat", time, url),
    `manual-test-tech-visit-${offset}:${userId}`
  );
}
