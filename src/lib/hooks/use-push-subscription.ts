"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// pushManager.subscribe() talks to the browser's push service (FCM for
// Chrome, Apple's for Safari) to mint the endpoint - on a slow or
// interrupted connection that call can hang indefinitely rather than
// reject, which would otherwise leave the Settings toggle spinning forever
// with no way out. A real end-to-end test surfaced exactly this: subscribe
// never settled on a degraded connection, so enable()'s own finally never
// ran. Timing it out turns an infinite spinner into a real, retryable error.
const SUBSCRIBE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Shared subscribe/unsubscribe logic behind the Settings notifications
// row - split out so it isn't reimplemented anywhere else that needs the
// same on/off state.
export function usePushSubscription() {
  // These read browser-only globals (navigator, Notification) that don't
  // exist during SSR. Seeding state from them via a useState initializer
  // would make the very first client render disagree with the
  // server-rendered HTML (e.g. SettingsRow flipping between a disabled
  // <div> and an interactive <button>), causing a hydration mismatch - so
  // both start at a stable SSR-safe default. Deferred a tick, same as the
  // install-app-row's initial read of its own browser-only globals - these
  // reads can't happen during the server-rendered first pass, so the
  // update is pushed past mount instead of running directly in the effect
  // body.
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      setSupported(typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
    });
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setSubscribed(Boolean(existing));
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setError("push_vapid_not_configured");
      console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set client-side - cannot subscribe.");
      return;
    }
    setBusy(true);
    setError(null);
    let subscription: PushSubscription | null = null;
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }),
        SUBSCRIBE_TIMEOUT_MS,
        "push_subscribe_timeout"
      );
      await savePushSubscription(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setSubscribed(true);
    } catch (err) {
      // The browser-level subscription can succeed even when saving it
      // server-side fails (a network blip, or the server rejecting it) -
      // left as-is, the device would hold a subscription the server has no
      // record of and will never push to, silently. Undo it so the toggle
      // staying "off" actually reflects the device's real state, and the
      // failure isn't invisible.
      console.error("[push] enable failed:", err);
      setError(err instanceof Error ? err.message : "push_enable_failed");
      if (subscription) {
        await subscription.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error("[push] disable failed:", err);
      setError(err instanceof Error ? err.message : "push_disable_failed");
    } finally {
      setBusy(false);
    }
  };

  return { supported, subscribed, permission, busy, error, enable, disable };
}
