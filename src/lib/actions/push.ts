"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { sendTestPushToUser } from "@/lib/push";

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

// Temporary diagnostic action - returns the real failure reason instead of
// swallowing it, so we can see why pushes aren't arriving in production.
export async function testPush(): Promise<{ subscriptionCount: number; results: { ok: boolean; error?: string }[] } | { error: string }> {
  const profile = await requireProfile();
  try {
    return await sendTestPushToUser(profile.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
