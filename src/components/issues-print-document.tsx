import Image from "next/image";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import {
  areaDisplayLabel,
  classificationDisplayLabel,
  getOpStatusLabels,
  OP_STATUS_COLORS,
  OP_STATUS_TEXT_COLORS,
} from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus } from "@/lib/types/database";

export type MachineHours = { name: string; hours: number; weekOf: string };

// Statuses in the order a client wants to read them: what needs their
// decision first, then what is waiting, then what is being worked on.
const OPEN_ORDER: IssueOpStatus[] = ["awaiting_owner_approval", "pending", "not_started", "in_progress"];
const PIE_ORDER: IssueOpStatus[] = ["awaiting_owner_approval", "pending", "not_started", "in_progress", "completed"];

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

function issueDate(issue: Issue) {
  return issue.issue_date ?? issue.created_at.slice(0, 10);
}

function isGenerator(name: string) {
  return /gen|onan|kohler|גנר/i.test(name);
}

// One slice per status as an SVG donut (no chart library: it has to render
// identically on paper). A single status fills the whole ring.
function StatusDonut({ slices, total }: { slices: { color: string; value: number }[]; total: number }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  // Each slice starts where the previous one ended.
  const arcs = slices.map((s, i) => ({
    ...s,
    len: (s.value / total) * circumference,
    offset: slices.slice(0, i).reduce((sum, p) => sum + (p.value / total) * circumference, 0),
  }));
  return (
    <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-hidden="true" style={exact}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e3e6ec" strokeWidth="16" />
      {arcs.map((a) => (
        <circle
          key={`${a.color}-${a.offset}`}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={a.color}
          strokeWidth="16"
          strokeDasharray={`${a.len} ${circumference - a.len}`}
          strokeDashoffset={-a.offset}
        />
      ))}
    </svg>
  );
}

// Client-facing printable report for a boat's defect list: machine hours,
// a status overview (donut + counts), then the jobs split into pending /
// completed, with everything under warranty in its own section. Hidden on
// screen, shown only through window.print() - same convention as the budget
// and inventory print documents.
export function IssuesPrintDocument({
  boatName,
  boatLogoUrl,
  machines,
  issues,
  locale,
}: {
  boatName: string;
  boatLogoUrl: string | null;
  machines: MachineHours[];
  issues: Issue[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const statusLabels = getOpStatusLabels(locale);

  // Cancelled jobs are not part of a client report.
  const jobs = issues.filter((i) => i.op_status !== "cancelled");
  const warranty = jobs.filter((i) => i.is_warranty || i.classification === "warranty");
  const regular = jobs.filter((i) => !warranty.includes(i));
  const open = regular
    .filter((i) => i.op_status !== "completed")
    .sort((a, b) => OPEN_ORDER.indexOf(a.op_status) - OPEN_ORDER.indexOf(b.op_status) || issueDate(b).localeCompare(issueDate(a)));
  const done = regular.filter((i) => i.op_status === "completed").sort((a, b) => issueDate(b).localeCompare(issueDate(a)));
  const warrantySorted = [...warranty].sort(
    (a, b) => PIE_ORDER.indexOf(a.op_status) - PIE_ORDER.indexOf(b.op_status) || issueDate(b).localeCompare(issueDate(a))
  );

  const counts = PIE_ORDER.map((s) => ({ status: s, count: jobs.filter((i) => i.op_status === s).length })).filter((c) => c.count > 0);
  const total = jobs.length;
  const generators = machines.filter((m) => isGenerator(m.name));
  const engines = machines.filter((m) => !isGenerator(m.name));

  const statusChip = (status: IssueOpStatus) => (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold"
      style={{ color: OP_STATUS_TEXT_COLORS[status], background: `${OP_STATUS_COLORS[status]}26`, ...exact }}
    >
      {statusLabels[status]}
    </span>
  );

  const table = (rows: Issue[]) => (
    <table className="w-full table-fixed border-collapse text-xs">
      <colgroup>
        <col className="w-[13%]" />
        <col className="w-[33%]" />
        <col className="w-[14%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
        <col className="w-[14%]" />
      </colgroup>
      <thead>
        <tr className="text-fleet-ink">
          {["issue_entered_date", "issue_title_f", "issue_classification", "issue_area", "issue_location", "status_word"].map((k) => (
            <th key={k} className="border-b border-fleet-border p-1.5 text-start font-semibold">
              {t(k as Parameters<typeof translate>[1])}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((issue) => (
          <tr key={issue.id} className="break-inside-avoid border-b border-fleet-border">
            <td className="p-1.5 align-top whitespace-nowrap" dir="ltr">
              {formatDateDisplay(issueDate(issue))}
            </td>
            <td className="p-1.5 align-top font-medium text-fleet-navy">{issue.title}</td>
            <td className="p-1.5 align-top">{classificationDisplayLabel(locale, issue.classification)}</td>
            <td className="p-1.5 align-top">{areaDisplayLabel(locale, issue.area)}</td>
            <td className="p-1.5 align-top">{issue.location}</td>
            <td className="p-1.5 align-top">{statusChip(issue.op_status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const section = (title: string, color: string, rows: Issue[]) => (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 border-b-2 pb-1 text-sm font-bold text-fleet-navy" style={{ borderColor: color, ...exact }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, ...exact }} />
        {title} <span className="font-normal text-fleet-ink">({rows.length})</span>
      </h2>
      {rows.length === 0 ? <p className="text-xs text-fleet-ink">{t("report_no_jobs")}</p> : table(rows)}
    </section>
  );

  const hoursGroup = (title: string, list: MachineHours[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <div className="text-2xs font-semibold uppercase tracking-wide text-fleet-ink">{title}</div>
        <div className="flex flex-wrap gap-2">
          {list.map((m) => (
            <div key={m.name} className="min-w-[9rem] rounded-lg border border-fleet-border bg-white px-3 py-2 break-inside-avoid">
              <div className="text-2xs text-fleet-ink">{m.name}</div>
              <div className="text-lg font-bold tabular-nums text-fleet-navy" dir="ltr">
                {m.hours.toLocaleString("en-US")} <span className="text-xs font-normal text-fleet-ink">{t("report_hours_unit")}</span>
              </div>
              <div className="text-2xs text-fleet-ink">
                {t("report_hours_updated", { date: formatDateDisplay(m.weekOf) })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="hidden print:block">
      <div dir="ltr" className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {boatLogoUrl && (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
              <Image src={boatLogoUrl} alt="" fill sizes="56px" className="object-contain" />
            </div>
          )}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mys-logo.png" alt="" className="h-14 w-14 object-contain" />
          </div>
          <div>
            <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
            <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-bold">{t("issues_report_title")}</div>
          <div className="text-xs text-fleet-ink">{boatName}</div>
          <div className="text-xs text-fleet-ink">{formatDateDisplay(todayLocalISO())}</div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {machines.length > 0 && (
          <section className="flex flex-col gap-3 break-inside-avoid">
            <h2 className="text-sm font-bold text-fleet-navy">{t("report_machine_hours")}</h2>
            {hoursGroup(t("report_engines"), engines)}
            {hoursGroup(t("report_generators"), generators)}
          </section>
        )}

        {total > 0 && (
          <section className="flex items-center gap-6 rounded-xl border border-fleet-border bg-fleet-paper p-4 break-inside-avoid" style={exact}>
            <div className="relative shrink-0">
              <StatusDonut slices={counts.map((c) => ({ color: OP_STATUS_COLORS[c.status], value: c.count }))} total={total} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold tabular-nums text-fleet-navy">{total}</div>
                <div className="text-2xs text-fleet-ink">{t("report_total_jobs")}</div>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="text-sm font-bold text-fleet-navy">{t("report_job_status")}</div>
              {counts.map((c) => (
                <div key={c.status} className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: OP_STATUS_COLORS[c.status], ...exact }} />
                  <span className="flex-1">{statusLabels[c.status]}</span>
                  <span className="font-bold tabular-nums">{c.count}</span>
                  <span className="w-10 text-end text-fleet-ink tabular-nums" dir="ltr">
                    {Math.round((c.count / total) * 100)}%
                  </span>
                </div>
              ))}
              {warranty.length > 0 && (
                <div className="mt-1 border-t border-fleet-border pt-1.5 text-xs text-fleet-ink">
                  {t("report_warranty_jobs")}: <span className="font-bold text-fleet-navy">{warranty.length}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {section(t("report_pending_jobs"), OP_STATUS_COLORS.pending, open)}
        {section(t("report_completed_jobs"), OP_STATUS_COLORS.completed, done)}
        {warranty.length > 0 && section(t("report_warranty_jobs"), "#4c6585", warrantySorted)}
      </div>
    </div>
  );
}
