"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Wrench, XCircle } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-format";
import { getAreaLabels, getClassificationLabels, getOpStatusLabels, OP_STATUS_COLORS } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS_INLINE } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Issue, IssueOpStatus } from "@/lib/types/database";

type IssueWithBoat = Issue & { boatName: string };
type SortKey = "boat" | "date" | "status";

const OP_STATUS_ICON: Record<IssueOpStatus, typeof Wrench> = {
  not_started: Wrench,
  pending: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_ORDER: Record<IssueOpStatus, number> = {
  not_started: 0,
  pending: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
};

export function FleetIssuesList({
  issues,
  boats,
  locale,
}: {
  issues: IssueWithBoat[];
  boats: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const areaLabels = getAreaLabels(locale);
  const classificationLabels = getClassificationLabels(locale);
  const opStatusLabels = getOpStatusLabels(locale);

  const [sortBy, setSortBy] = useState<SortKey>("boat");
  // null means "all boats" - otherwise the explicit set of boat ids to show.
  const [selectedBoatIds, setSelectedBoatIds] = useState<Set<string> | null>(null);

  const toggleBoat = (id: string) => {
    setSelectedBoatIds((prev) => {
      const next = new Set(prev ?? boats.map((b) => b.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(
    () => (selectedBoatIds ? issues.filter((i) => selectedBoatIds.has(i.boat_id)) : issues),
    [issues, selectedBoatIds]
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === "boat") return a.boatName.localeCompare(b.boatName);
      if (sortBy === "status") return STATUS_ORDER[a.op_status] - STATUS_ORDER[b.op_status];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [filtered, sortBy]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-light tracking-wide text-fleet-navy">{t("fleet_open_issues_title")}</h1>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
        <label className="flex items-center gap-1.5 text-xs text-fleet-ink">
          {t("sort_by")}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className={INPUT_CLASS_INLINE}
          >
            <option value="boat">{t("boat_word")}</option>
            <option value="date">{t("date_word")}</option>
            <option value="status">{t("status_word")}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedBoatIds(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
              !selectedBoatIds ? "border-fleet-navy bg-fleet-navy text-white" : "border-fleet-border text-fleet-ink"
            }`}
          >
            {t("all_boats")}
          </button>
          {boats.map((b) => {
            const active = selectedBoatIds ? selectedBoatIds.has(b.id) : true;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBoat(b.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  active ? "border-fleet-brass bg-fleet-brass/15 text-fleet-navy" : "border-fleet-border text-fleet-ink"
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("no_issues")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((issue) => {
            const StatusIcon = OP_STATUS_ICON[issue.op_status];
            const metaLine = [classificationLabels[issue.classification], areaLabels[issue.area], issue.location]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={issue.id}
                href={`/boats/${issue.boat_id}/maintenance/issues`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3 hover:shadow-sm"
              >
                <div className="min-w-[140px] flex-1">
                  <div className="text-xs font-bold text-fleet-brass">{issue.boatName}</div>
                  <div className="text-sm font-semibold text-fleet-navy">{issue.title}</div>
                  {metaLine && <div className="text-xs text-fleet-ink">{metaLine}</div>}
                  {issue.due_date && (
                    <div className="text-xs text-fleet-ink">
                      {t("issue_due_date")}: <span dir="ltr">{formatDateDisplay(issue.due_date)}</span>
                    </div>
                  )}
                </div>
                <span
                  style={{ color: OP_STATUS_COLORS[issue.op_status], background: `${OP_STATUS_COLORS[issue.op_status]}26` }}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                >
                  <StatusIcon size={13} /> {opStatusLabels[issue.op_status]}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
