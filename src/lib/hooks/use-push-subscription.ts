"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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

  useEffect(() => {
    Promise.resolve().then(() => {
      setSupported(typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
    });
  }, []);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
    });
  }, [supported]);

  const enable = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    setBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await savePushSubscription(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  return { supported, subscribed, permission, busy, enable, disable };
}
