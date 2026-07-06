"use client";

import { useState } from "react";
import { ChevronDown, FileBarChart, Trash2, Wrench } from "lucide-react";
import { issueFinancialReport, issueTechnicalReport, deleteReport } from "@/lib/actions/reports";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { DateInput } from "@/components/date-input";
import { getCategoryLabels, getCategoryColors, getOpStatusLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { FinancialSnapshot, Report, TechnicalSnapshot } from "@/lib/types/database";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

export function ReportsManager({
  boatId,
  reports,
  reportType,
  issuerNames,
  isManagement,
  locale,
}: {
  boatId: string;
  reports: Report[];
  reportType: "financial" | "technical";
  issuerNames: Record<string, string>;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = reports.filter((r) => r.type === reportType);
  const periodKey = (r: Report) => r.period_start ?? r.month ?? "";
  const sorted = [...filtered].sort((a, b) => periodKey(b).localeCompare(periodKey(a)) || b.issued_at.localeCompare(a.issued_at));

  return (
    <div className="flex flex-col gap-4">
      {isManagement && (
        <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              {t("from_date")}
              <DateInput
                value={from}
                onChange={setFrom}
                locale={locale}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fleet-ink">
              {t("to_date")}
              <DateInput
                value={to}
                onChange={setTo}
                locale={locale}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
              />
            </label>
          </div>
          {reportType === "financial" ? (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await issueFinancialReport(boatId, from, to);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <FileBarChart size={15} /> {t("issue_financial")}
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await issueTechnicalReport(boatId, from, to);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-fleet-navy py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              <Wrench size={15} /> {t("issue_technical")}
            </button>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_reports")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((r) => {
            const isOpen = openId === r.id;
            const Icon = r.type === "financial" ? FileBarChart : Wrench;
            return (
              <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <button onClick={() => setOpenId(isOpen ? null : r.id)} className="flex w-full items-center gap-2.5 text-start">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                    <Icon size={17} className="text-fleet-brass" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">
                      {r.type === "financial" ? t("report_financial_title") : t("report_technical_title")} —{" "}
                      <span dir="ltr">{r.period_start && r.period_end ? `${r.period_start} – ${r.period_end}` : r.month}</span>
                    </div>
                    <div className="text-[11px] text-fleet-ink">
                      {t("issued_by")} {issuerNames[r.issued_by ?? ""] ?? "—"} · <span dir="ltr">{r.issued_at.slice(0, 10)}</span>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-fleet-brass transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </button>

                {isOpen && (
                  <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
                    {r.type === "financial" ? (
                      <FinancialReportBody snapshot={r.snapshot as FinancialSnapshot} locale={locale} />
                    ) : (
                      <TechnicalReportBody snapshot={r.snapshot as TechnicalSnapshot} locale={locale} />
                    )}
                    {isManagement && (
                      <form action={deleteReport.bind(null, boatId, r.id)} className="mt-2.5">
                        <ConfirmSubmitButton
                          confirmMessage={t("delete_report_confirm")}
                          className="flex items-center gap-1 text-xs font-medium text-fleet-coral"
                        >
                          <Trash2 size={13} /> {t("delete_word")}
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FinancialReportBody({ snapshot, locale }: { snapshot: FinancialSnapshot; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getCategoryLabels(locale);
  const categoryColors = getCategoryColors();
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">{t("report_income_word")}</div>
          <div className="text-base font-bold text-fleet-moss">{formatCurrency(snapshot.totalIncome)}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">{t("report_expenses_word")}</div>
          <div className="text-base font-bold text-fleet-coral">{formatCurrency(snapshot.totalExpenses)}</div>
        </div>
      </div>
      <div className="mb-2 text-sm">
        {t("net_flow")}: <b>{formatCurrency(snapshot.net)}</b>
      </div>
      <div className="mb-2 text-sm">
        {t("withdrawals")}: {formatCurrency(snapshot.cashWithdrawals)} · {t("report_expenses_word")}: {formatCurrency(snapshot.cashUsage)}
      </div>
      {snapshot.byCategory.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-fleet-ink">{t("expenses_by_category")}</div>
          <CategoryPieChart
            data={snapshot.byCategory.map((c) => ({
              name: categoryLabels[c.category],
              value: c.sum,
              color: categoryColors[c.category],
            }))}
          />
          {snapshot.byCategory.map((c) => (
            <div key={c.category} className="flex justify-between border-b border-dotted border-fleet-border py-1 text-sm">
              <span>{categoryLabels[c.category]}</span>
              <span>{formatCurrency(c.sum)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechnicalReportBody({ snapshot, locale }: { snapshot: TechnicalSnapshot; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const opStatusLabels = getOpStatusLabels(locale);
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">{t("report_new_issues")}</div>
          <div className="text-base font-bold">{snapshot.newIssues}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">{t("report_resolved")}</div>
          <div className="text-base font-bold text-fleet-moss">{snapshot.resolvedThisMonth}</div>
        </div>
        <div className="rounded-lg bg-fleet-paper p-2.5">
          <div className="text-[11px] text-fleet-ink">{t("report_still_open")}</div>
          <div className={`text-base font-bold ${snapshot.stillOpen > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
            {snapshot.stillOpen}
          </div>
        </div>
      </div>
      {snapshot.issueList.length > 0 && (
        <div className="mb-2">
          {snapshot.issueList.map((i, idx) => (
            <div key={idx} className="border-b border-dotted border-fleet-border py-1 text-sm">
              {i.title} — {opStatusLabels[i.status]}
            </div>
          ))}
        </div>
      )}
      {snapshot.docAlerts.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-bold text-fleet-coral">{t("expiring_soon")}</div>
          {snapshot.docAlerts.map((d, idx) => (
            <div key={idx} className="border-b border-dotted border-fleet-border py-1 text-sm">
              {d.name} — <span dir="ltr">{d.expiryDate}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
