import { describe, expect, it } from "vitest";
import type { Issue, IssueOpStatus } from "@/lib/types/database";
import { buildIssuesReport } from "./issues-report";

let n = 0;
function issue(op: IssueOpStatus, opts: { warranty?: boolean; status?: Issue["status"] } = {}): Issue {
  n++;
  return {
    id: String(n), boat_id: "b", title: `Job ${n}`, classification: "repair", is_warranty: opts.warranty ?? false, area: "technical", location: null,
    supplier: null, supplier_labour: null, estimated_cost: null, payment_method: null, due_date: null,
    issue_date: `2026-10-${String((n % 28) + 1).padStart(2, "0")}`, assigned_to: null, notes: null, photo_path: null, quote_path: null,
    op_status: op, status: opts.status ?? "approved", created_by: null, approved_by: null, approved_at: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  };
}
const many = (op: IssueOpStatus, count: number, warranty = 0) =>
  Array.from({ length: count }, (_, i) => issue(op, { warranty: i < warranty }));

describe("buildIssuesReport", () => {
  // The HOFESH export: 55 jobs = 13 awaiting + 17 in progress + 5 pending +
  // 20 completed, of which 12 are under warranty (6 in progress, 6 completed).
  const hofesh = [
    ...many("awaiting_owner_approval", 13),
    ...many("in_progress", 17, 6),
    ...many("pending", 5),
    ...many("completed", 20, 6),
  ];
  it("counts every job once, in its own status group", () => {
    const r = buildIssuesReport(hofesh);
    expect(r.counts).toEqual({ awaiting: 13, in_progress: 17, pending: 5, completed: 20 });
    expect(r.total).toBe(55);
    const ids = r.groups.flatMap((g) => g.issues.map((i) => i.id));
    expect(new Set(ids).size).toBe(55);
  });
  it("counts warranty jobs as a separate figure, not a separate list", () => {
    const r = buildIssuesReport(hofesh);
    expect(r.warranty.total).toBe(12);
    expect(r.warranty.byGroup).toEqual({ awaiting: 0, in_progress: 6, pending: 0, completed: 6 });
    expect(r.groups.flatMap((g) => g.issues).filter((i) => i.is_warranty)).toHaveLength(12);
  });
  it("maps the retired not_started to Pending; drops cancelled and unapproved", () => {
    const r = buildIssuesReport([issue("not_started"), issue("pending"), issue("cancelled"), issue("completed", { status: "pending" })]);
    expect(r.counts).toEqual({ awaiting: 0, in_progress: 0, pending: 2, completed: 0 });
  });
  it("orders each group newest-logged first", () => {
    const r = buildIssuesReport(many("completed", 5));
    const dates = r.groups[3].issues.map((i) => i.issue_date!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
