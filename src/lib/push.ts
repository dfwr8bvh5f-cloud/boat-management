import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not set. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to the environment.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

async function sendToSubscriptions(
  supabase: ReturnType<typeof createAdminClient>,
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  payload: { title: string; body: string; url?: string }
) {
  if (subscriptions.length === 0) return;
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(sub.endpoint);
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }
}

// Pushes a notification to every subscribed browser/device across all users.
// Silently drops subscriptions the push service reports as gone (410/404).
export async function sendPushToAll(payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
  await sendToSubscriptions(supabase, subscriptions ?? [], payload);
}

// Pushes only to the users whose profile email matches one of the given
// addresses (case-insensitive) - used for approval alerts that should go to
// a specific person/inbox rather than everyone.
export async function sendPushToEmails(emails: string[], payload: { title: string; body: string; url?: string }) {
  if (emails.length === 0) return;
  ensureConfigured();
  const supabase = createAdminClient();

  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const { data: profiles } = await supabase.from("profiles").select("id, email");
  const matchedIds = (profiles ?? []).filter((p) => p.email && wanted.has(p.email.toLowerCase())).map((p) => p.id);
  if (matchedIds.length === 0) return;

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", matchedIds);
  await sendToSubscriptions(supabase, subscriptions ?? [], payload);
}

// Pushes to everyone who should know about a boat's calendar activity: all
// management users, plus whichever captain/owner is assigned to that boat.
export async function sendPushToBoatCrew(boatId: string, payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  const supabase = createAdminClient();

  const { data: profiles } = await supabase.from("profiles").select("id").or(`role.eq.management,boat_id.eq.${boatId}`);
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) return;

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", ids);
  await sendToSubscriptions(supabase, subscriptions ?? [], payload);
}

// Pushes to just the captain assigned to a boat (plus management, so the
// reminder/escalation is visible fleet-side too) - narrower than
// sendPushToBoatCrew, which also includes the owner.
export async function sendPushToBoatCaptain(boatId: string, payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  const supabase = createAdminClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .or(`role.eq.management,and(role.eq.captain,boat_id.eq.${boatId})`);
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) return;

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", ids);
  await sendToSubscriptions(supabase, subscriptions ?? [], payload);
}
