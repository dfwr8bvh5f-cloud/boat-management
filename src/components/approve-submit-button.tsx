"use client";

import { useFormStatus } from "react-dom";
import { translate } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same pending/disabled treatment as ConfirmSubmitButton's own submit
// button, minus the confirm-first step - for a form-action save that
// doesn't need confirmation first (approve, as opposed to delete/reject).
export function ApproveSubmitButton({ locale, className }: { locale: Locale; className?: string }) {
  const { pending } = useFormStatus();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <Button type="submit" loading={pending} className={className}>
      {t("approve")}
    </Button>
  );
}
