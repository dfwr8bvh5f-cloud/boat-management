"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export function ChangePasswordButton({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("change_password")}
        title={t("change_password")}
        className="rounded-lg border border-fleet-brass/40 p-2 text-fleet-paper/80 hover:bg-white/10"
      >
        <KeyRound size={17} />
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-72 rounded-xl border border-fleet-brass/40 bg-fleet-hero-start p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-fleet-paper">{t("change_password")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close_word")}
              className="text-fleet-paper/70 hover:text-fleet-paper"
            >
              <X size={15} />
            </button>
          </div>
          <ResetPasswordForm
            labels={{
              newPassword: t("reset_password_new_label"),
              submit: t("reset_password_submit"),
              updating: t("reset_password_updating"),
              success: t("reset_password_success"),
              loginNow: t("close_word"),
            }}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
