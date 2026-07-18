"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { resetUserPassword } from "@/lib/actions/users";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_INLINE } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";

const fieldClass = INPUT_CLASS_INLINE;

export function ResetPasswordButton({ userId, locale }: { userId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setError(null);
        }}
        className="text-xs font-medium text-fleet-teal hover:underline"
      >
        {t("admin_reset_password_button")}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await resetUserPassword(userId, formData);
            setDone(true);
            formRef.current?.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : t("admin_reset_password_error"));
          }
        });
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex items-center gap-1.5">
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder={t("admin_reset_password_placeholder")}
          className={`${fieldClass} w-40`}
        />
        <button type="submit" disabled={pending} className="rounded-lg border border-fleet-teal px-2.5 py-1.5 text-xs font-bold text-fleet-teal disabled:opacity-60">
          {pending ? "…" : t("update_word")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-fleet-ink">
          <X size={13} />
        </button>
      </div>
      {error && <p className="text-xs text-fleet-coral">{error}</p>}
      {done && <p className="text-xs text-fleet-moss">{t("admin_reset_password_done")}</p>}
    </form>
  );
}
