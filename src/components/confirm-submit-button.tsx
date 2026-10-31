"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { translate } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import { RippleLoader } from "@/components/ripple-loader";
import type { Locale } from "@/lib/i18n/dictionaries";

// Disables itself and dims while its form's action is running, so clicking
// gives an immediate visual response instead of appearing frozen until the
// whole server round trip (and the page data it refreshes) completes.
// confirmMessage is optional - omit it for a submit button that doesn't
// need a confirmation dialog first (e.g. approve, as opposed to delete).
// The confirmation itself is an in-app popup rather than the browser's
// native window.confirm() dialog, matching the rest of the app's UI.
//
// `destructive` switches the popup's "Yes" button from the primary teal to
// the destructive coral variant - pass it for anything permanent/
// irreversible (delete, archive, cancel a booking). Defaults to false so
// every existing call site keeps today's teal confirm unless it opts in.
export function ConfirmSubmitButton({
  confirmMessage,
  destructive = false,
  className,
  children,
  ariaLabel,
  locale,
}: {
  confirmMessage?: string;
  destructive?: boolean;
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
        {pending && ariaLabel ? (
          // Icon-only button (ariaLabel is only ever set when children isn't
          // self-describing text) - swap the icon for the spinner instead of
          // showing both cramped into a fixed h-9 w-9 box.
          <RippleLoader size="sm" />
        ) : (
          <>
            {pending && <RippleLoader size="sm" />}
            {children}
          </>
        )}
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
              <Button variant="secondary" className="flex-1" onClick={() => setShowConfirm(false)}>
                {t("no_word")}
              </Button>
              <Button
                variant={destructive ? "destructive" : "primary"}
                className="flex-1"
                onClick={() => {
                  setShowConfirm(false);
                  buttonRef.current?.form?.requestSubmit(buttonRef.current);
                }}
              >
                {t("yes_word")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
