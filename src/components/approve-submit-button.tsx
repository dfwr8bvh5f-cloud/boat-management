"use client";

import { useFormStatus } from "react-dom";
import { translate } from "@/lib/i18n/translate";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";
import { RippleLoader } from "@/components/ripple-loader";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same pending/disabled treatment as ConfirmSubmitButton's own submit
// button, minus the confirm-first step - for a form-action save that
// doesn't need confirmation first (approve, as opposed to delete/reject).
export function ApproveSubmitButton({ locale, className }: { locale: Locale; className?: string }) {
  const { pending } = useFormStatus();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <button type="submit" disabled={pending} className={`flex items-center justify-center gap-2 ${className ?? PRIMARY_BUTTON_CLASS}`}>
      {pending && <RippleLoader size="sm" />}
      {t("approve")}
    </button>
  );
}
