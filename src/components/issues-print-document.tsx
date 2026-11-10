import Image from "next/image";
import { Ship } from "lucide-react";
// Static import (not the lazy wrapper) so the donut is already in the HTML
// when the page is printed - same reasoning as FinancialReportDocument.
import { CategoryPieChartFixed } from "@/components/category-pie-chart-fixed";
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
export type FuelStatus = { status: string; weekOf: string };

// Statuses in the order a client wants to read them: what needs their
// decision first, then what is waiting, then what is being worked on.
const OPEN_ORDER: IssueOpStatus[] = ["awaiting_owner_approval", "pending", "not_started", "in_progress"];
const PIE_ORDER: IssueOpStatus[] = ["awaiting_owner_approval", "pending", "not_started", "in_progress", "completed"];

// At most this many photos are shown under one job (the rest are counted).
const MAX_PHOTOS = 4;

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

// Same literal divider hex and section-title style as the financial and
// owner-trip reports (see FinancialReportDocument for why not the
// border-fleet-border class).
const DIVIDER = "#e3e6ec";
const sectionTitleClass = "text-2xs font-semibold tracking-[0.18em] text-fleet-brass uppercase print:break-after-avoid";

function issueDate(issue: Issue) {
  return issue.issue_date ?? issue.created_at.slice(0, 10);
}

function isGenerator(name: string) {
  return /gen|onan|kohler|גנר/i.test(name);
}

// Client-facing printable report for a boat's defect list, in the same flat,
// card-free visual language as the financial / owner-trip reports: machine
// hours, a status overview (donut + counts), then the jobs split into pending
// / completed, with everything under warranty in its own section. Hidden on
// screen, shown only through window.print().
export function IssuesPrintDocument({
  boatName,
  boatLogoUrl,
  machines,
  fuel = null,
  photosByIssueId = {},
  issues,
  locale,
  screen = false,
}: {
  boatName: string;
  boatLogoUrl: string | null;
  machines: MachineHours[];
  fuel?: FuelStatus | null;
  // Photo URLs per issue id (see buildIssuePhotoMap); shown under the job.
  photosByIssueId?: Record<string, string[]>;
  issues: Issue[];
  locale: Locale;
  // true: also visible on screen (the client report page); false: print only.
  screen?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const statusLabels = getOpStatusLabels(locale);

  // Cancelled jobs and unapproved drafts are not part of a client report.
  const jobs = issues.filter((i) => i.op_status !== "cancelled" && i.status === "approved");
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

  const statusCell = (status: IssueOpStatus) => (
    <span className="inline-flex items-start gap-1.5 font-medium" style={{ color: OP_STATUS_TEXT_COLORS[status] }}>
      <span className="mt-[3px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: OP_STATUS_COLORS[status], ...exact }} />
      {statusLabels[status]}
    </span>
  );

  const table = (rows: Issue[]) => (
    <table className="mt-3 w-full table-fixed text-start text-2xs">
      <colgroup>
        <col style={{ width: "12%" }} />
        <col style={{ width: "29%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "19%" }} />
      </colgroup>
      <thead className="table-header-group">
        <tr className="border-b border-fleet-navy text-2xs font-semibold tracking-wide text-fleet-ink uppercase">
          {["issue_entered_date", "issue_title_f", "issue_classification", "issue_area", "issue_location", "status_word"].map((k) => (
            <th key={k} className="py-2 pe-2 text-start break-words">
              {t(k as Parameters<typeof translate>[1])}
            </th>
          ))}
        </tr>
      </thead>
      {rows.map((issue) => {
        const photos = photosByIssueId[issue.id] ?? [];
        return (
        <tbody key={issue.id} className="border-b align-top print:break-inside-avoid" style={{ borderColor: DIVIDER }}>
          <tr>
            <td className="py-2 pe-3 whitespace-nowrap text-fleet-ink">
              <span dir="ltr">{formatDateDisplay(issueDate(issue))}</span>
            </td>
            <td className="py-2 pe-3 leading-snug break-words font-medium text-fleet-navy">{issue.title}</td>
            <td className="py-2 pe-3 leading-snug break-words text-fleet-ink">{classificationDisplayLabel(locale, issue.classification)}</td>
            <td className="py-2 pe-3 leading-snug break-words text-fleet-ink">{areaDisplayLabel(locale, issue.area)}</td>
            <td className="py-2 pe-3 leading-snug break-words text-fleet-ink">{issue.location}</td>
            <td className="py-2">{statusCell(issue.op_status)}</td>
          </tr>
          {photos.length > 0 && (
            <tr>
              <td />
              <td colSpan={5} className="pb-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {photos.slice(0, MAX_PHOTOS).map((url) => (
                    // Plain <img>: eager so it is loaded by the time the page is printed.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" loading="eager" decoding="sync" className="h-20 w-28 rounded object-cover" style={{ border: `1px solid ${DIVIDER}` }} />
                  ))}
                  {photos.length > MAX_PHOTOS && (
                    <span className="self-end text-2xs text-fleet-ink">+{photos.length - MAX_PHOTOS}</span>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
        );
      })}
    </table>
  );

  const jobsSection = (title: string, dot: string, rows: Issue[]) => (
    <section className="border-t py-6 print:py-4" style={{ borderColor: DIVIDER }}>
      <h2 className={`${sectionTitleClass} flex items-center gap-2`}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot, ...exact }} />
        {title} <span className="font-medium text-fleet-ink">({rows.length})</span>
      </h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-fleet-ink">{t("report_no_jobs")}</p> : table(rows)}
    </section>
  );

  const hoursGroup = (title: string, list: MachineHours[]) =>
    list.length > 0 && (
      <div className="mt-4 first:mt-3 print:mt-3">
        <div className="mb-2 text-2xs font-medium tracking-wide text-fleet-ink uppercase">{title}</div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 print:grid-cols-4 print:gap-4">
          {list.map((m) => (
            <div key={m.name} className="flex flex-col gap-1 print:break-inside-avoid">
              <div className="text-xs text-fleet-ink">{m.name}</div>
              <div className="text-2xl font-semibold tabular-nums whitespace-nowrap text-fleet-navy print:text-lg" dir="ltr">
                {m.hours.toLocaleString("en-US")} <span className="text-xs font-normal text-fleet-ink">{t("report_hours_unit")}</span>
              </div>
              <div className="text-2xs text-fleet-ink">{t("report_hours_updated", { date: formatDateDisplay(m.weekOf) })}</div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className={screen ? "" : "hidden print:block"}>
      <div
        className={`flex w-full flex-col bg-white print:block print:max-w-none print:p-0 print:pt-[15mm] print-page-issues-report ${
          screen ? "mx-auto max-w-4xl px-2 py-4 sm:px-8 sm:py-8" : ""
        }`}
        style={exact}
      >
        {/* The app shell paints the body fleet-paper; a printed report is plain white. */}
        <style>{"@media print{html,body{background:#fff!important}}"}</style>

        <header className="flex items-start justify-between gap-6 border-b border-fleet-navy pb-6 print:break-inside-avoid print:pb-4">
          <div className="min-w-0">
            <div className="text-2xs font-semibold tracking-[0.22em] text-fleet-brass uppercase">MYS FLEET</div>
            <h1 className="mt-2 font-brand text-4xl font-light leading-tight text-fleet-navy print:text-3xl">{boatName}</h1>
            <div className="mt-1 text-base font-medium text-fleet-navy">{t("issues_report_title")}</div>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-fleet-ink print:mt-2">
              <div>
                {t("report_generated_on")}:{" "}
                <span className="font-medium text-fleet-navy" dir="ltr">
                  {formatDateDisplay(todayLocalISO())}
                </span>
              </div>
            </div>
          </div>
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center print:h-14 print:w-14">
            {boatLogoUrl ? (
              <Image src={boatLogoUrl} alt="" fill sizes="64px" className="object-contain" />
            ) : (
              <Ship size={28} className="text-fleet-brass" />
            )}
          </div>
        </header>

        {(machines.length > 0 || fuel) && (
          <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
            <h2 className={sectionTitleClass}>{t("report_machine_hours")}</h2>
            {hoursGroup(t("report_engines"), engines)}
            {hoursGroup(t("report_generators"), generators)}
            {fuel && (
              <div className="mt-4 print:mt-3 print:break-inside-avoid">
                <div className="mb-2 text-2xs font-medium tracking-wide text-fleet-ink uppercase">{t("report_fuel_status")}</div>
                <div className="text-lg font-semibold text-fleet-navy">{fuel.status}</div>
                <div className="text-2xs text-fleet-ink">{t("report_hours_updated", { date: formatDateDisplay(fuel.weekOf) })}</div>
              </div>
            )}
          </section>
        )}

        {total > 0 && (
          <section className="border-t py-6 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
            <h2 className={sectionTitleClass}>{t("report_job_status")}</h2>
            <div className="mt-4 flex flex-row items-center gap-6 print:mt-3">
              <div className="h-44 w-44 shrink-0 print:h-36 print:w-36">
                <CategoryPieChartFixed data={counts.map((c) => ({ name: c.status, value: c.count, color: OP_STATUS_COLORS[c.status] }))} size={176} />
              </div>
              <div className="flex w-full flex-col">
                {counts.map((c) => (
                  <div key={c.status} className="flex items-center justify-between gap-3 border-b py-2 text-sm print:py-1" style={{ borderColor: DIVIDER }}>
                    <span className="flex items-center gap-2 text-fleet-navy">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OP_STATUS_COLORS[c.status], ...exact }} />
                      {statusLabels[c.status]}
                    </span>
                    <span className="font-medium text-fleet-navy tabular-nums whitespace-nowrap" dir="ltr">
                      {c.count} <span className="font-normal text-fleet-ink">· {Math.round((c.count / total) * 100)}%</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 py-2 text-sm font-medium text-fleet-navy print:py-1">
                  <span>{t("report_total_jobs")}</span>
                  <span className="tabular-nums" dir="ltr">{total}</span>
                </div>
                {warranty.length > 0 && (
                  <div className="flex items-center justify-between gap-3 text-xs text-fleet-ink">
                    <span>{t("report_warranty_jobs")}</span>
                    <span className="tabular-nums" dir="ltr">{warranty.length}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {jobsSection(t("report_pending_jobs"), OP_STATUS_COLORS.pending, open)}
        {jobsSection(t("report_completed_jobs"), OP_STATUS_COLORS.completed, done)}
        {warranty.length > 0 && jobsSection(t("report_warranty_jobs"), "#4c6585", warrantySorted)}
      </div>
    </div>
  );
}
