import Image from "next/image";
import { CircleAlert, CircleCheck, Clock, Ship, ShieldCheck, Wrench } from "lucide-react";
// Static import (not the lazy wrapper) so the donut is already in the HTML
// when the page is printed - same reasoning as FinancialReportDocument.
import { CategoryPieChartFixed } from "@/components/category-pie-chart-fixed";
import { ReportKpiCard } from "@/components/report-kpi-card";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { areaDisplayLabel, classificationDisplayLabel, OP_STATUS_COLORS, OP_STATUS_TEXT_COLORS } from "@/lib/labels";
import { buildIssuesReport, isUnderWarranty, issueLoggedDate, type ReportGroupKey } from "@/lib/issues-report";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus } from "@/lib/types/database";

export type MachineHours = { name: string; hours: number; weekOf: string };
export type FuelStatus = { status: string; weekOf: string };

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

// Same literal divider hex and section-title style as the financial and
// owner-trip reports (see FinancialReportDocument for why not the
// border-fleet-border class).
const DIVIDER = "#e3e6ec";
const sectionTitleClass = "text-2xs font-semibold tracking-[0.18em] text-fleet-brass uppercase print:break-after-avoid";

// One look per group: the colour of the app's own status for it, plus a
// distinct icon and the written title, so the four groups (and "awaiting your
// approval" vs "pending" in particular) still read apart in black and white.
const GROUP_STATUS: Record<ReportGroupKey, IssueOpStatus> = {
  awaiting: "awaiting_owner_approval",
  in_progress: "in_progress",
  pending: "pending",
  completed: "completed",
};
const GROUP_ICON = { awaiting: CircleAlert, in_progress: Wrench, pending: Clock, completed: CircleCheck } as const;
const GROUP_TITLE_KEY = {
  awaiting: "report_group_awaiting",
  in_progress: "report_group_in_progress",
  pending: "report_group_pending",
  completed: "report_group_completed",
} as const;

// Identical column widths in every table so the columns line up on every page.
const COLUMNS = ["12%", "54%", "14%", "20%"];

// Client-facing printable technical report for a boat, in the same flat,
// card-free visual language as the financial / owner-trip reports: summary
// with the four status counts, measured machine / fuel readings,
// the jobs grouped by status (each job once, warranty as an icon) with its photos
// beside it. Hidden on screen unless `screen`; always shown when printing.
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
  // Photo URLs per issue id (see buildIssuePhotoMap); shown beside each job.
  photosByIssueId?: Record<string, string[]>;
  // Issues that have a quote file attached (no longer shown; kept so callers still type-check).
  quoteIssueIds?: string[];
  issues: Issue[];
  locale: Locale;
  // true: also visible on screen (the client report page); false: print only.
  screen?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const report = buildIssuesReport(issues);

  const groupTitle = (k: ReportGroupKey) => t(GROUP_TITLE_KEY[k]);
  const nonEmptyGroups = report.groups.filter((g) => g.issues.length > 0);
  const generators = machines.filter((m) => /gen|onan|kohler|גנר/i.test(m.name));
  const engines = machines.filter((m) => !generators.includes(m));

  // The readings heading names only what is actually recorded.
  const readingParts = [
    ...(engines.length > 0 ? [t("report_hours_engine")] : []),
    ...(generators.length > 0 ? [t("report_hours_generator")] : []),
    ...(fuel ? [t("report_fuel_level")] : []),
  ];

  // Icon only (the summary line already names the warranty); the title is
  // laid out beside it in a flex row so wrapped lines stay aligned.
  const warrantyIcon = (issue: Issue) =>
    isUnderWarranty(issue) && (
      <span className="mt-px shrink-0 text-fleet-navy" title={t("report_under_warranty")} aria-label={t("report_under_warranty")}>
        <ShieldCheck size={12} />
      </span>
    );

  const targetDate = (issue: Issue) =>
    issue.due_date && issue.op_status !== "completed" ? (
      <div className="mt-0.5 text-fleet-ink">
        {t("report_target_date")}: <span dir="ltr" className="font-medium text-fleet-navy">{formatDateDisplay(issue.due_date)}</span>
      </div>
    ) : null;

  const groupTable = (key: ReportGroupKey, rows: Issue[]) => {
    const status = GROUP_STATUS[key];
    const Icon = GROUP_ICON[key];
    const headCls = "py-1.5 pe-3 text-start font-semibold whitespace-nowrap";
    return (
      <section key={key} className="mt-6 print:mt-5">
        <table className="w-full table-fixed text-start text-2xs">
          <colgroup>
            {COLUMNS.map((w) => (
              <col key={w + key} style={{ width: w }} />
            ))}
          </colgroup>
          {/* The group title row sits in the repeating header, so every
              continuation page restates which list continues. */}
          <thead className="table-header-group">
            <tr>
              <th colSpan={4} className="border-b-2 pb-1.5 pt-0 text-start" style={{ borderColor: OP_STATUS_COLORS[status], ...exact }}>
                <span
                  className={`flex items-center gap-2 text-sm font-bold ${key === "awaiting" ? "rounded-t px-2 py-1 text-white" : ""}`}
                  style={key === "awaiting" ? { background: OP_STATUS_TEXT_COLORS[status], ...exact } : { color: OP_STATUS_TEXT_COLORS[status] }}
                >
                  <Icon size={15} />
                  {groupTitle(key)}
                  <span className="rounded-full border px-2 py-px text-2xs font-semibold tabular-nums" style={{ borderColor: key === "awaiting" ? "#fff" : OP_STATUS_COLORS[status], ...exact }}>
                    {rows.length}
                  </span>
                  {key === "awaiting" && <span className="text-2xs font-semibold uppercase">{t("report_action_required")}</span>}
                </span>
              </th>
            </tr>
            <tr className="border-b border-fleet-navy text-2xs text-fleet-ink uppercase">
              <th className={headCls}>{t("report_col_logged")}</th>
              <th className={headCls}>{t("report_col_work_item")}</th>
              <th className={headCls}>{t("report_col_type")}</th>
              <th className={headCls}>{t("report_col_location")}</th>
            </tr>
          </thead>
          {rows.map((issue) => (
            <tbody key={issue.id} className="print:break-inside-avoid">
              <tr className="border-b align-top" style={{ borderColor: DIVIDER }}>
                <td className="py-1.5 pe-3 whitespace-nowrap text-fleet-ink">
                  <span dir="ltr">{formatDateDisplay(issueLoggedDate(issue))}</span>
                </td>
                <td className="py-1.5 pe-3 leading-snug break-words text-fleet-navy">
                  <div className="flex items-start gap-1.5">
                    {warrantyIcon(issue)}
                    <div className="min-w-0">
                      <span className="font-medium">{issue.title}</span>
                      {targetDate(issue)}
                      {(photosByIssueId[issue.id]?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {photosByIssueId[issue.id].map((url) => (
                            // Plain <img>, eager, so it is loaded by the time the page is printed.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={url} src={url} alt="" loading="eager" decoding="sync" className="h-14 w-[4.5rem] rounded object-cover" style={{ border: `1px solid ${DIVIDER}` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-1.5 pe-3 leading-snug text-fleet-ink">{classificationDisplayLabel(locale, issue.classification)}</td>
                <td className="py-1.5 leading-snug break-words text-fleet-ink">{issue.location?.trim() || areaDisplayLabel(locale, issue.area)}</td>
              </tr>
            </tbody>
          ))}
        </table>
      </section>
    );
  };

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

        {/* The logo is loaded eagerly: in the print-only variant this block is display:none on screen, so a lazy image would never load before printing. */}
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
          <div className="relative flex h-24 w-48 shrink-0 items-center justify-center print:h-20 print:w-44">
            {boatLogoUrl ? (
              <Image src={boatLogoUrl} alt="" fill sizes="192px" loading="eager" className="object-contain" />
            ) : (
              <Ship size={28} className="text-fleet-brass" />
            )}
          </div>
        </header>

        {/* ===== Summary ===== */}
        {report.total > 0 && (
          <section className="border-b py-5 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
            <h2 className={sectionTitleClass}>{t("report_summary_title")}</h2>
            <div className="mt-3 flex items-center gap-6 print:gap-5">
              <div className="grid flex-1 grid-cols-3 gap-3">
                {report.groups.map((g) => {
                  const status = GROUP_STATUS[g.key];
                  const Icon = GROUP_ICON[g.key];
                  const lead = g.key === "awaiting";
                  return (
                    <div
                      key={g.key}
                      className={`rounded-lg border px-3 py-2 ${lead ? "col-span-3" : ""}`}
                      style={
                        lead
                          ? { background: OP_STATUS_TEXT_COLORS[status], borderColor: OP_STATUS_TEXT_COLORS[status], ...exact }
                          : { borderColor: DIVIDER, borderInlineStartWidth: 4, borderInlineStartColor: OP_STATUS_COLORS[status], ...exact }
                      }
                    >
                      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase" style={{ color: lead ? "#fff" : OP_STATUS_TEXT_COLORS[status] }}>
                        <Icon size={12} />
                        {groupTitle(g.key)}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`font-semibold tabular-nums ${lead ? "text-4xl text-white" : "text-2xl text-fleet-navy"}`}>{g.issues.length}</span>
                        {lead && g.issues.length > 0 && (
                          <span className="text-xs font-semibold text-white">
                            {t("report_action_required")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="h-32 w-32 shrink-0 print:h-28 print:w-28">
                <CategoryPieChartFixed
                  data={report.groups.map((g) => ({ name: g.key, value: g.issues.length, color: OP_STATUS_COLORS[GROUP_STATUS[g.key]] }))}
                  size={128}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-fleet-ink">
              <span>
                {t("report_total_jobs")}: <span className="font-semibold tabular-nums text-fleet-navy">{report.total}</span>
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck size={12} />
                {t("report_under_warranty")}: <span className="font-semibold tabular-nums text-fleet-navy">{report.warranty.total}</span>
                {report.warranty.total > 0 && (
                  <span>
                    (
                    {report.groups
                      .filter((g) => report.warranty.byGroup[g.key] > 0)
                      .map((g) => `${report.warranty.byGroup[g.key]} ${groupTitle(g.key).toLowerCase()}`)
                      .join(" · ")}
                    )
                  </span>
                )}
              </span>
            </div>
          </section>
        )}

        {/* ===== Measured readings (only what exists) ===== */}
        {readingParts.length > 0 && (
          <section className="border-b py-5 print:break-inside-avoid print:py-4" style={{ borderColor: DIVIDER }}>
            <h2 className={sectionTitleClass}>{readingParts.join(", ")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 print:mt-2 print:grid-cols-4 print:gap-3">
              {[...engines, ...generators].map((m) => (
                <ReportKpiCard
                  key={m.name}
                  label={m.name}
                  value={`${m.hours.toLocaleString("en-US")} ${t("report_hours_unit")}`}
                  subLabel={t("report_measured_on", { date: formatDateDisplay(m.weekOf) })}
                />
              ))}
              {fuel && (
                <ReportKpiCard
                  label={t("report_fuel_level")}
                  value={fuel.status}
                  numeric={false}
                  subLabel={t("report_measured_on", { date: formatDateDisplay(fuel.weekOf) })}
                />
              )}
            </div>
          </section>
        )}

        {/* ===== Jobs, one group per status ===== */}
        {nonEmptyGroups.map((g) => groupTable(g.key, g.issues))}
      </div>
    </div>
  );
}
