"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireManagement } from "@/lib/auth";
import { sendPushToUser, type PushSendResult } from "@/lib/push";
import { translate } from "@/lib/i18n/translate";

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
