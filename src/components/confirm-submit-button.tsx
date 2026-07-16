"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { translate } from "@/lib/i18n/translate";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";

// Disables itself and dims while its form's action is running, so clicking
// gives an immediate visual response instead of appearing frozen until the
// whole server round trip (and the page data it refreshes) completes.
// confirmMessage is optional - omit it for a submit button that doesn't
// need a confirmation dialog first (e.g. approve, as opposed to delete).
// The confirmation itself is an in-app popup rather than the browser's
// native window.confirm() dialog, matching the rest of the app's UI.
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
  ariaLabel,
  locale,
}: {
  confirmMessage?: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  locale: Locale;
}) {
  const { pending } = useFormStatus();
  const [showConfirm, setShowConfirm] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        className={`${className ?? ""} ${pending ? "opacity-50" : ""}`}
        aria-label={ariaLabel}
        onClick={(event) => {
          if (confirmMessage) {
            event.preventDefault();
            setShowConfirm(true);
          }
        }}
      >
        {children}
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{confirmMessage}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowConfirm(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  buttonRef.current?.form?.requestSubmit(buttonRef.current);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
