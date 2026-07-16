const TONE_CLASSES = {
  neutral: "text-fleet-navy",
  positive: "text-fleet-moss",
  negative: "text-fleet-coral",
} as const;

export function ReportKpiCard({
  label,
  value,
  subLabel,
  tone = "neutral",
  numeric = true,
}: {
  label: string;
  value: string;
  subLabel?: string;
  tone?: keyof typeof TONE_CLASSES;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-fleet-border bg-white p-6 shadow-sm print:break-inside-avoid print:shadow-none">
      <div className="text-xs font-medium tracking-wide text-fleet-ink uppercase">{label}</div>
      <div
        className={`text-3xl font-semibold tabular-nums whitespace-nowrap ${TONE_CLASSES[tone]}`}
        dir={numeric ? "ltr" : undefined}
      >
        {value}
      </div>
      {subLabel && (
        <div className="text-xs text-fleet-ink" dir="ltr">
          {subLabel}
        </div>
      )}
    </div>
  );
}
