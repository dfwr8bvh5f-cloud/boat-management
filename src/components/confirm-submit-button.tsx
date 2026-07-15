"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, X } from "lucide-react";

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
}: {
  confirmMessage?: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [showConfirm, setShowConfirm] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                aria-label="cancel"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-fleet-border py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
              >
                <X size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  buttonRef.current?.form?.requestSubmit(buttonRef.current);
                }}
                aria-label="confirm"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-fleet-coral py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Check size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
