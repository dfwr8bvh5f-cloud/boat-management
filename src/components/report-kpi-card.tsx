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
}) {
  const content = (
    <>
      <div className="text-xs font-medium tracking-wide text-fleet-ink uppercase">{label}</div>
      <div
        className={`text-2xl font-semibold tabular-nums whitespace-nowrap print:text-lg ${TONE_CLASSES[tone]}`}
        dir={numeric ? "ltr" : undefined}
      >
        {value}
      </div>
      {subLabel && (
        <div className="text-xs text-fleet-ink" dir="ltr">
          {subLabel}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-6 shadow-sm transition hover:border-fleet-navy/40 hover:shadow-md print:break-inside-avoid print:gap-1 print:p-3 print:shadow-none"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-6 shadow-sm print:break-inside-avoid print:gap-1 print:p-3 print:shadow-none">
      {content}
    </div>
  );
}
