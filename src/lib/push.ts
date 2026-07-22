import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/lib/i18n/dictionaries";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@example.com";
  if (!publicKey || !privateKey) {
    console.error("[push] VAPID keys are not set - every send below will fail until NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set in the environment.");
    throw new Error("VAPID keys are not set. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to the environment.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

const DEFAULT_LOCALE: Locale = "he";

export type PushPayload = { title: string; body: string; url?: string };
// Either a fixed payload, or a builder that renders the notification text in
// a given recipient's own language - each recipient's locale comes from
// their profile, so the same call can go out in different languages.
export type PushContent = PushPayload | ((locale: Locale) => PushPayload);

// What actually happened when a send was attempted - returned all the way
// back up to the caller (the cron routes, the dev test-push tool) so
// "nothing arrived" can be told apart from "nobody was ever subscribed" at
// a glance instead of only from raw server logs.
export type PushSendResult = {
  targetedUsers: number;
  targetedDevices: number;
  delivered: number;
  failed: number;
  staleRemoved: number;
};

const EMPTY_RESULT: PushSendResult = { targetedUsers: 0, targetedDevices: 0, delivered: 0, failed: 0, staleRemoved: 0 };

function resolveContent(content: PushContent, locale: Locale): PushPayload {
  return typeof content === "function" ? content(locale) : content;
}

async function localesByUserId(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, Locale>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, locale").in("id", userIds);
  return new Map((data ?? []).map((p) => [p.id, p.locale]));
}

async function sendToSubscriptions(
  supabase: ReturnType<typeof createAdminClient>,
  subscriptions: { endpoint: string; p256dh: string; auth: string; user_id: string }[],
  content: PushContent,
  label: string
): Promise<PushSendResult> {
  if (subscriptions.length === 0) {
    console.log(`[push:${label}] 0 devices targeted (matched users have no push subscription)`);
    return EMPTY_RESULT;
  }

  const localeById = await localesByUserId(supabase, [...new Set(subscriptions.map((s) => s.user_id))]);
  const staleEndpoints: string[] = [];
  let delivered = 0;
  let failed = 0;

  console.log(`[push:${label}] sending to ${subscriptions.length} device(s) across ${localeById.size} user(s)`);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const payload = resolveContent(content, localeById.get(sub.user_id) ?? DEFAULT_LOCALE);
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        delivered++;
        console.log(`[push:${label}] delivered to user ${sub.user_id} (endpoint ...${sub.endpoint.slice(-12)})`);
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
          console.log(`[push:${label}] subscription gone (${statusCode}) for user ${sub.user_id} - removing`);
        } else {
          // A gone/expired subscription (404/410) is expected and handled
          // above by cleanup - anything else (auth failure, bad VAPID
          // config, the push service rejecting the payload, ...) means the
          // notification silently never arrived, with zero trace anywhere
          // else. This is the only place that failure is ever visible.
          console.error(`[push:${label}] send FAILED for user ${sub.user_id}: statusCode=${statusCode}`, err);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  console.log(
    `[push:${label}] done: ${delivered} delivered, ${failed} failed, ${staleEndpoints.length} stale subscriptions removed`
  );

  return {
    targetedUsers: localeById.size,
    targetedDevices: subscriptions.length,
    delivered,
    failed,
    staleRemoved: staleEndpoints.length,
  };
}

// Pushes a notification to every subscribed browser/device across all users.
// Silently drops subscriptions the push service reports as gone (410/404).
export async function sendPushToAll(content: PushContent, label = "all"): Promise<PushSendResult> {
  ensureConfigured();
  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
  return sendToSubscriptions(supabase, subscriptions ?? [], content, label);
}

// Pushes only to the users whose profile email matches one of the given
// addresses (case-insensitive) - used for approval alerts that should go to
// a specific person/inbox rather than everyone.
export async function sendPushToEmails(emails: string[], content: PushContent, label = "emails"): Promise<PushSendResult> {
  if (emails.length === 0) return EMPTY_RESULT;
  ensureConfigured();
  const supabase = createAdminClient();

  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const { data: profiles } = await supabase.from("profiles").select("id, email");
  const matchedIds = (profiles ?? []).filter((p) => p.email && wanted.has(p.email.toLowerCase())).map((p) => p.id);
  if (matchedIds.length === 0) {
    console.log(`[push:${label}] 0 profiles matched the given email(s)`);
    return EMPTY_RESULT;
  }

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", matchedIds);
  return sendToSubscriptions(supabase, subscriptions ?? [], content, label);
}

// Pushes to everyone who should know about a boat's calendar activity: all
// management users, plus whichever captain/owner is assigned to that boat.
export async function sendPushToBoatCrew(boatId: string, content: PushContent, label = "boat-crew"): Promise<PushSendResult> {
  ensureConfigured();
  const supabase = createAdminClient();

  const { data: profiles } = await supabase.from("profiles").select("id").or(`role.eq.management,boat_id.eq.${boatId}`);
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) {
    console.log(`[push:${label}] 0 profiles matched for boat ${boatId}`);
    return EMPTY_RESULT;
  }

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", ids);
  return sendToSubscriptions(supabase, subscriptions ?? [], content, label);
}

// Pushes to just the captain assigned to a boat (plus management, so the
// reminder/escalation is visible fleet-side too) - narrower than
// sendPushToBoatCrew, which also includes the owner.
export async function sendPushToBoatCaptain(boatId: string, content: PushContent, label = "boat-captain"): Promise<PushSendResult> {
  ensureConfigured();
  const supabase = createAdminClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .or(`role.eq.management,and(role.eq.captain,boat_id.eq.${boatId})`);
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) {
    console.log(`[push:${label}] 0 profiles matched for boat ${boatId}`);
    return EMPTY_RESULT;
  }

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", ids);
  return sendToSubscriptions(supabase, subscriptions ?? [], content, label);
}

// Pushes to a single specific user, regardless of their role/subscriptions
// to anything else - used by the developer test-push tool (Settings, admin
// only) to confirm the whole pipeline (VAPID config, stored subscription,
// actual delivery) works for one real account on demand, without waiting
// for a cron or triggering a real event.
export async function sendPushToUser(userId: string, content: PushContent, label = "test"): Promise<PushSendResult> {
  ensureConfigured();
  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
  return sendToSubscriptions(supabase, subscriptions ?? [], content, label);
}
