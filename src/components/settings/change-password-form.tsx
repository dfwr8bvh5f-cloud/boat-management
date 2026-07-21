"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

// Unlike the old header popover (which only ever called
// supabase.auth.updateUser directly against the already-live session, with
// no re-check of anything), this re-authenticates against the current
// password first via signInWithPassword - a wrong "current password" must
// be rejected before any change is made, not just before it's saved.
export function ChangePasswordForm({ email, locale }: { email: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="rounded-lg border border-fleet-moss/40 bg-fleet-moss/10 px-3 py-2.5 text-sm text-fleet-moss">
        {t("reset_password_success")}
      </p>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const currentPassword = String(formData.get("current_password") ?? "");
        const newPassword = String(formData.get("new_password") ?? "");
        const confirmPassword = String(formData.get("confirm_password") ?? "");

        setError(null);

        if (newPassword !== confirmPassword) {
          setError(t("error_passwords_dont_match"));
          return;
        }

        setPending(true);
        try {
          const supabase = createClient();
          const { error: authError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
          if (authError) {
            setError(t("error_current_password_incorrect"));
            return;
          }
          const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
          if (updateError) {
            setError(updateError.message);
            return;
          }
          setDone(true);
        } finally {
          setPending(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current_password" className="text-xs text-fleet-ink">
          {t("settings_current_password_label")}
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new_password" className="text-xs text-fleet-ink">
          {t("reset_password_new_label")}
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm_password" className="text-xs text-fleet-ink">
          {t("settings_confirm_password_label")}
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT_CLASS}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-fleet-coral/50 bg-fleet-coral/10 px-3 py-2 text-sm text-fleet-coral-text">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
        {pending ? t("reset_password_updating") : t("reset_password_submit")}
      </button>
    </form>
  );
}
