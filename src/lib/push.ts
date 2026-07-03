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

// Diagnostic helper (temporary) - sends to the current user's own
// subscriptions and reports back exactly what happened per-subscription,
// instead of swallowing errors like the notify* helpers do.
export async function sendTestPushToUser(userId: string) {
  ensureConfigured();
  const supabase = createAdminClient();
  const { data: subscriptions, error: fetchError } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  if (fetchError) return { subscriptionCount: 0, results: [{ ok: false, error: fetchError.message }] };

  const results = await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: "בדיקת התראות", body: "אם קיבלת את זה, הפוש עובד" })
        );
        return { ok: true };
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        return { ok: false, error: `statusCode=${e.statusCode ?? "?"} ${e.body ?? e.message ?? String(err)}` };
      }
    })
  );

  return { subscriptionCount: subscriptions?.length ?? 0, results };
}
