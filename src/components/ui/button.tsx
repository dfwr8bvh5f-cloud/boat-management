"use client";

import { forwardRef } from "react";
import { useFormStatus } from "react-dom";
import { RippleLoader } from "@/components/ripple-loader";

// The app-wide shared button. Replaces the old PRIMARY_BUTTON_CLASS/
// SECONDARY_BUTTON_CLASS string constants (src/lib/ui-classes.ts) plus the
// ~7 recurring ad-hoc button styles found across the app during the
// icon/button consolidation audit (outlined-teal "tertiary" buttons,
// rounded-full navy pill buttons used as actions, underline text/link
// buttons, and three different icon-only row-action sizes) - all of those
// collapse into the variant/size/iconOnly combinations below instead of
// being retyped per file.
//
// `loading` swaps the children for the shared RippleLoader and disables
// the button, so every button gets the same in-flight treatment for free
// instead of each call site hand-rolling its own pending state (as
// ConfirmSubmitButton/ApproveSubmitButton used to do independently).
export type ButtonVariant = "primary" | "secondary" | "text" | "destructive";
export type ButtonSize = "default" | "compact";

const BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-bold transition-transform active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-fleet-teal text-white hover:opacity-90",
  secondary: "border border-fleet-border bg-white text-fleet-ink hover:bg-fleet-paper",
  // Transparent, no border - the "tertiary" outlined-teal style and the
  // various ad-hoc underline text buttons found in the audit both read as
  // the same lower-emphasis action and collapse into this one variant.
  text: "bg-transparent text-fleet-teal hover:underline disabled:hover:no-underline",
  destructive: "bg-fleet-coral text-white hover:opacity-90",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: "px-4 py-2.5 text-sm",
  // Row-inline buttons (a table row's own action, a compact card footer) -
  // was previously a mix of py-2/py-1.5/h-9 with no fixed rule.
  compact: "px-3 py-1.5 text-xs",
};

// Two icon-only sizes only - collapsing the h-9/h-7/h-5 spread the audit
// found into one documented pair: h-9 for a standalone row action, h-7 for
// a dense table with many rows where h-9 would feel oversized.
const ICON_ONLY_SIZE_CLASS: Record<ButtonSize, string> = {
  default: "h-9 w-9 p-0",
  compact: "h-7 w-7 p-0",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
};

// Icon-only buttons must pass a visible-text-free `children` (just the
// icon) plus a real `aria-label` - enforced here at the type level instead
// of as a convention, since the audit found 79% of today's icon-only
// buttons have no accessible name at all.
type IconOnlyProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    iconOnly: true;
    "aria-label": string;
    children: React.ReactNode;
  };

type NormalProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    iconOnly?: false;
    children: React.ReactNode;
  };

export type ButtonProps = IconOnlyProps | NormalProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", loading: loadingProp = false, iconOnly = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  // A submit button inside a <form action={...}> is locked and shows the
  // spinner for as long as that action is in flight, with no per-form
  // wiring - without this a double-click on a plain server-component form
  // (new income, new boat, catalog photo) ran the action twice and created
  // a duplicate row. Outside a form, or for onSubmit-handler forms, pending
  // is always false, so those keep using their own `loading` prop unchanged.
  const { pending } = useFormStatus();
  const loading = loadingProp || (type === "submit" && pending);
  const sizeClass = iconOnly ? ICON_ONLY_SIZE_CLASS[size] : SIZE_CLASS[size];
  const ariaLabel = typeof rest["aria-label"] === "string" ? rest["aria-label"] : undefined;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${sizeClass} ${className ?? ""}`}
      {...rest}
    >
      {loading && iconOnly ? (
        // Icon-only button: swap the icon for the spinner entirely, no
        // room for both in a fixed h-9/h-7 box.
        <RippleLoader size="sm" label={ariaLabel} />
      ) : (
        <>
          {loading && <RippleLoader size="sm" />}
          {children}
        </>
      )}
    </button>
  );
});
