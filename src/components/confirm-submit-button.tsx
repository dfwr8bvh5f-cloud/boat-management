"use client";

import { useFormStatus } from "react-dom";

// Disables itself and dims while its form's action is running, so clicking
// gives an immediate visual response instead of appearing frozen until the
// whole server round trip (and the page data it refreshes) completes.
// confirmMessage is optional - omit it for a submit button that doesn't
// need a confirmation dialog first (e.g. approve, as opposed to delete).
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
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} ${pending ? "opacity-50" : ""}`}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
