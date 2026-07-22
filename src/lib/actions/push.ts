"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireManagement } from "@/lib/auth";
import { sendPushToUser, type PushSendResult } from "@/lib/push";

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
export async function sendTestPush(userId: string): Promise<PushSendResult> {
  await requireManagement();
  return sendPushToUser(
    userId,
    {
      title: "MYS FLEET - בדיקה",
      body: "זוהי הודעת בדיקה שנשלחה ידנית מדף ההגדרות.",
      url: "/settings",
    },
    `manual-test:${userId}`
  );
}
