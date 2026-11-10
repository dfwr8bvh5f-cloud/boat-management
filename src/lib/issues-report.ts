import type { Issue, IssueOpStatus } from "@/lib/types/database";

// The four groups a client reads in the technical report, in reading order.
// "Pending" = open work that has not started yet (the app's own meaning: new
// issues start at "pending", and the retired "not_started" reads the same), so
// both map to it. Cancelled jobs and unapproved drafts are not in the report.
export type ReportGroupKey = "awaiting" | "in_progress" | "pending" | "completed";
export const REPORT_GROUP_ORDER: ReportGroupKey[] = ["awaiting", "in_progress", "pending", "completed"];

const GROUP_BY_STATUS: Partial<Record<IssueOpStatus, ReportGroupKey>> = {
  awaiting_owner_approval: "awaiting",
  in_progress: "in_progress",
  pending: "pending",
  not_started: "pending",
  completed: "completed",
};

export function reportGroupOf(status: IssueOpStatus): ReportGroupKey | null {
  return GROUP_BY_STATUS[status] ?? null;
}

export function isUnderWarranty(issue: Pick<Issue, "is_warranty" | "classification">) {
  return issue.is_warranty || issue.classification === "warranty";
}

export function issueLoggedDate(issue: Pick<Issue, "issue_date" | "created_at">) {
  return issue.issue_date ?? issue.created_at.slice(0, 10);
}

export type IssuesReport<T extends Issue = Issue> = {
  groups: { key: ReportGroupKey; issues: T[] }[];
  counts: Record<ReportGroupKey, number>;
  total: number;
  // Warranty jobs are NOT a separate list: each one sits in its own status
  // group (tagged), and is only counted here as a separate figure.
  warranty: { total: number; byGroup: Record<ReportGroupKey, number> };
};

const zero = (): Record<ReportGroupKey, number> => ({ awaiting: 0, in_progress: 0, pending: 0, completed: 0 });

// Every report figure (summary, tiles, tables) comes from this one result, so
// they cannot disagree, and every job appears exactly once.
export function buildIssuesReport<T extends Issue>(issues: T[]): IssuesReport<T> {
  const byGroup = new Map<ReportGroupKey, T[]>(REPORT_GROUP_ORDER.map((k) => [k, []]));
  const warrantyByGroup = zero();
  let warrantyTotal = 0;
  for (const issue of issues) {
    if (issue.status !== "approved") continue;
    const key = reportGroupOf(issue.op_status);
    if (!key) continue;
    byGroup.get(key)!.push(issue);
    if (isUnderWarranty(issue)) {
      warrantyTotal++;
      warrantyByGroup[key]++;
    }
  }
  const counts = zero();
  const groups = REPORT_GROUP_ORDER.map((key) => {
    // Newest logged first; same-date jobs keep a stable order by created_at.
    const list = byGroup.get(key)!.sort((a, b) => issueLoggedDate(b).localeCompare(issueLoggedDate(a)) || b.created_at.localeCompare(a.created_at));
    counts[key] = list.length;
    return { key, issues: list };
  });
  return { groups, counts, total: REPORT_GROUP_ORDER.reduce((s, k) => s + counts[k], 0), warranty: { total: warrantyTotal, byGroup: warrantyByGroup } };
}
