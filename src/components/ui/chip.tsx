"use client";

// A pill-shaped toggle/filter control - visually and semantically distinct
// from <Button>: a Chip reflects a *selection state* (this filter is on,
// this segment is chosen) rather than triggering an action, so it keeps
// its own rounded-full shape instead of being forced into Button's
// rounded-lg action-button language. Found as ~15 near-duplicate ad-hoc
// pill styles during the icon/button consolidation audit (filter toggles,
// percent/amount segmented switches, select-mode toggles) - this is the
// one shared shape all of them collapse into.
export function Chip({
  active = false,
  className,
  children,
  ...rest
}: {
  active?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
        active
          ? "border-fleet-teal bg-fleet-teal text-white"
          : "border-fleet-border bg-white text-fleet-navy hover:bg-fleet-paper"
      } ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
