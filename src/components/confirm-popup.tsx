"use client";

import { translate } from "@/lib/i18n/translate";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";

// Same in-app modal ConfirmSubmitButton renders internally, pulled out as
// its own component for cases where the confirmation has to happen *before*
// deciding whether to run some already-in-progress logic (e.g. a save that
// still needs its FormData handed off once confirmed) - not just before
// submitting a <form>, which is all ConfirmSubmitButton itself covers.
export function ConfirmPopup({
  message,
  onConfirm,
  onCancel,
  locale,
}: {
  message: string;
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
          <button type="button" onClick={onCancel} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
            {t("no_word")}
          </button>
          <button type="button" onClick={onConfirm} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
            {t("yes_word")}
          </button>
        </div>
      </div>
    </div>
  );
}
