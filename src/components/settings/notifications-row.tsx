"use client";

import { Bell } from "lucide-react";
import { usePushSubscription } from "@/lib/hooks/use-push-subscription";
import { RippleLoader } from "@/components/ripple-loader";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { SettingsRow } from "./settings-row";

export function NotificationsRow({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { supported, subscribed, permission, busy, error, enable, disable } = usePushSubscription();

  if (!supported) {
    return <SettingsRow icon={Bell} label={t("settings_notifications_unsupported")} disabled />;
  }

  const denied = permission === "denied" && !subscribed;

  return (
    <div className="flex flex-col gap-1.5">
      <SettingsRow
        icon={Bell}
        label={t("settings_notifications_row")}
        trailing={
          <button
            type="button"
            role="switch"
            aria-checked={subscribed}
            dir="ltr"
            disabled={busy || denied}
            onClick={() => (subscribed ? disable() : enable())}
            title={subscribed ? t("settings_notifications_status_on") : t("settings_notifications_status_off")}
            aria-label={subscribed ? t("settings_notifications_status_on") : t("settings_notifications_status_off")}
            className="relative flex h-6 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60"
            style={{ background: subscribed ? "var(--color-fleet-moss)" : "var(--color-fleet-border)" }}
          >
            {busy ? (
              <RippleLoader size="sm" className="text-white" />
            ) : (
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  subscribed ? "translate-x-5" : "translate-x-0"
                }`}
              />
            )}
          </button>
        }
      />
      {denied && <p className="px-3 text-xs text-fleet-ink">{t("settings_notifications_denied_hint")}</p>}
      {error && <p className="px-3 text-xs text-fleet-coral-text">{t("settings_notifications_error")}</p>}
    </div>
  );
}
