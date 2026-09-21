import Link from "next/link";

const TONE_CLASSES = {
  neutral: "text-fleet-navy",
  positive: "text-fleet-moss-text",
  negative: "text-fleet-coral-text",
} as const;

export function ReportKpiCard({
  label,
  value,
  subLabel,
  tone = "neutral",
  numeric = true,
  href,
  footer,
  compact = false,
}: {
  label: string;
  value: string;
  subLabel?: string;
  tone?: keyof typeof TONE_CLASSES;
  numeric?: boolean;
  // Optional - a card summarizing a page's own data (e.g. this month's
  // MYS expenses) links straight to that page instead of just displaying
  // the number, so it doubles as a shortcut.
  href?: string;
  // Optional - a small breakdown visualization under the value (e.g. the
  // MYS dashboard's cash-vs-bank segmented bar). Omitted everywhere else.
  footer?: React.ReactNode;
  // A much smaller footprint (tighter padding, smaller value text) for a
  // row of many tiles at once (e.g. the MYS dashboard's 5-across row) -
  // the boat finance report page keeps the default full size.
  compact?: boolean;
}) {
  const content = (
    <>
      <div className="text-2xs font-medium tracking-wide text-fleet-ink uppercase">{label}</div>
      <div
        className={`font-semibold tabular-nums whitespace-nowrap print:text-lg ${compact ? "text-base" : "text-2xl"} ${TONE_CLASSES[tone]}`}
        dir={numeric ? "ltr" : undefined}
      >
        {value}
      </div>
      {subLabel && (
        <div className="text-xs text-fleet-ink" dir="ltr">
          {subLabel}
        </div>
      )}
      {footer}
    </>
  );

  const sizeClass = compact ? "gap-1 p-3" : "gap-2 p-6";

  if (href) {
    return (
      <Link
        href={href}
        className={`flex flex-col rounded-xl border border-fleet-border bg-white shadow-sm transition hover:border-fleet-navy/40 hover:shadow-md print:break-inside-avoid print:gap-1 print:p-3 print:shadow-none ${sizeClass}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`flex flex-col rounded-xl border border-fleet-border bg-white shadow-sm print:break-inside-avoid print:gap-1 print:p-3 print:shadow-none ${sizeClass}`}>
      {content}
    </div>
  );
}
