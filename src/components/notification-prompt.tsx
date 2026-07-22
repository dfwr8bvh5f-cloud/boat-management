"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "@/lib/hooks/use-push-subscription";
import { detectPwaPlatform, isRunningStandalone } from "@/lib/pwa-install";
import { RippleLoader } from "@/components/ripple-loader";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const DISMISSED_KEY = "mys-fleet-notif-prompt-dismissed";

// Browsers require a real user gesture before they'll show the permission
// dialog at all - there is no way to silently turn push notifications "on
// by default" the moment an account is created. This is the closest a web
// app can get: ask proactively, right after login, instead of leaving the
// toggle buried in Settings for someone to stumble on - so the default
// *path* is "on" (one tap accepts the browser's own prompt) rather than
// requiring someone to go looking for an opt-in.
//
// Shown once per device: dismissing ("not now") or completing either
// action (enabled, or the browser prompt got denied) marks it as seen in
// localStorage so it doesn't nag on every subsequent visit. iOS only
// supports Web Push for a PWA already added to the home screen - regular
// Safari tabs can't subscribe at all, so this stays hidden there rather
// than offering a toggle that can't work yet.
export function NotificationPrompt({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { supported, subscribed, permission, busy, enable } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true);
  const [iosNotInstalled, setIosNotInstalled] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
      setIosNotInstalled(detectPwaPlatform() === "ios" && !isRunningStandalone());
    });
  }, []);

  if (!supported || iosNotInstalled || dismissed || subscribed || permission !== "default") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-fleet-brass bg-fleet-highlight p-3 print:hidden">
      <Bell size={16} className="shrink-0 text-fleet-brass" />
      <p className="flex-1 text-xs text-fleet-navy">{t("notification_prompt_body")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          await enable();
          dismiss();
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy && <RippleLoader size="sm" />}
        {t("notification_prompt_enable")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("notification_prompt_dismiss")}
        title={t("notification_prompt_dismiss")}
        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
      >
        <X size={16} />
      </button>
    </div>
  );
}
