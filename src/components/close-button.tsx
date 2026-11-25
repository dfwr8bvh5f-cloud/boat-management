import { X } from "lucide-react";

// The one icon-only "close / dismiss" button used app-wide (modal and panel
// headers, lightbox viewers, dismissible notices). Always an X, always has an
// accessible name, never turns coral on hover (coral is reserved for delete -
// see the "remove" buttons, which are intentionally NOT this component).
//
//   default     - header of a modal / panel / popup (h-9, 16px X).
//   overlay     - over a photo/document lightbox, pinned to the top end corner.
//   overlayDark - same, for the dark lightbox (white-on-dark).
//   inline      - end of a notice/alert row; inherits the row's text color.
const BASE =
  "flex shrink-0 items-center justify-center transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1";
const VARIANT_CLASS = {
  default: "h-9 w-9 rounded-lg text-fleet-ink hover:bg-fleet-paper",
  overlay: "absolute end-4 top-4 h-9 w-9 rounded-full bg-white/90 text-fleet-navy",
  overlayDark: "absolute end-4 top-4 h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20",
  inline: "h-7 w-7 rounded-lg text-current hover:opacity-70",
} as const;

export function CloseButton({
  label,
  onClick,
  variant = "default",
  className = "",
}: {
  label: string;
  onClick: () => void;
  variant?: keyof typeof VARIANT_CLASS;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`${BASE} ${VARIANT_CLASS[variant]} ${className}`}>
      <X size={variant === "inline" ? 14 : 16} aria-hidden="true" />
    </button>
  );
}
