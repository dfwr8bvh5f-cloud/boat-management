"use client";

import { translate } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same in-app modal ConfirmSubmitButton renders internally, pulled out as
// its own component for cases where the confirmation has to happen *before*
// deciding whether to run some already-in-progress logic (e.g. a save that
// still needs its FormData handed off once confirmed) - not just before
// submitting a <form>, which is all ConfirmSubmitButton itself covers.
//
// `destructive` switches the "Yes" button from primary teal to the
// destructive coral variant - see ConfirmSubmitButton for why. Defaults to
// false so every existing call site keeps today's teal confirm.
export function ConfirmPopup({
  message,
  destructive = false,
  onConfirm,
  onCancel,
  locale,
}: {
  message: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-fleet-navy">{message}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            {t("no_word")}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} className="flex-1" onClick={onConfirm}>
            {t("yes_word")}
          </Button>
        </div>
      </div>
    </div>
  );
}
