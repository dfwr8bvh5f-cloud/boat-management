import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireManagement } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_EMAIL } from "@/lib/demo";

export const dynamic = "force-dynamic";

// Friendly labels for the sub-pages under a boat's own section (see the
// directory listing under src/app/(app)/boats/[id]) - a raw path like
// "/boats/<id>/finance/expenses" is meaningless to skim at a glance.
const PATH_LABELS: Record<string, string> = {
  "": "Overview",
  bookings: "Bookings",
  catalog: "Catalog",
  documents: "Documents",
  staff: "Crew",
  finance: "Finance overview",
  "finance/bank": "Bank",
  "finance/bank-reconciliation": "Bank reconciliation",
  "finance/budget": "Budget",
  "finance/cash": "Cash",
  "finance/expenses": "Expenses",
  "finance/future": "Future expenses",
  "finance/periodic-reports": "Periodic reports",
  "finance/report": "Owner report",
  maintenance: "Maintenance overview",
  "maintenance/inventory": "Inventory",
  "maintenance/issues": "Issues",
  "maintenance/reports": "Weekly engine reports",
  "maintenance/specs": "Technical specs",
};

function labelForPath(path: string, boatPrefix: string): string {
  if (!path.startsWith(boatPrefix)) return path;
  const suffix = path.slice(boatPrefix.length).replace(/^\//, "");
  return PATH_LABELS[suffix] ?? suffix ?? "Overview";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

type ViewRow = { path: string; viewed_at: string };
type Visit = { visitId: string; views: ViewRow[] };

export default async function DemoVisitsPage() {
  await requireManagement();

  const admin = createAdminClient();
  const { data: demoProfile } = await admin.from("profiles").select("boat_id").eq("email", DEMO_EMAIL).maybeSingle();
  const boatPrefix = demoProfile?.boat_id ? `/boats/${demoProfile.boat_id}` : "";

  const { data: rows } = await admin
    .from("demo_page_views")
    .select("visit_id, path, viewed_at")
    .order("viewed_at", { ascending: true })
    .limit(2000);

  const byVisit = new Map<string, ViewRow[]>();
  for (const r of rows ?? []) {
    const list = byVisit.get(r.visit_id) ?? [];
    list.push({ path: r.path, viewed_at: r.viewed_at });
    byVisit.set(r.visit_id, list);
  }
  const visits: Visit[] = [...byVisit.entries()]
    .map(([visitId, views]) => ({ visitId, views }))
    .sort((a, b) => b.views[b.views.length - 1].viewed_at.localeCompare(a.views[a.views.length - 1].viewed_at));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <Link href="/settings" className="flex w-fit items-center gap-1.5 text-sm text-fleet-ink hover:text-fleet-navy">
        <ArrowLeft size={16} /> Settings
      </Link>
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">Demo link visits</h1>
      <p className="text-xs text-fleet-ink">
        Every time the /demo link is opened, each page the visitor views gets logged here under that one visit - most
        recent visit first.
      </p>

      {visits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          No one has opened the demo link yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visits.map((visit, i) => {
            const first = visit.views[0];
            const last = visit.views[visit.views.length - 1];
            const durationMs = new Date(last.viewed_at).getTime() - new Date(first.viewed_at).getTime();

            const counts = new Map<string, number>();
            for (const v of visit.views) {
              const label = labelForPath(v.path, boatPrefix);
              counts.set(label, (counts.get(label) ?? 0) + 1);
            }
            const focus = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

            return (
              <div key={visit.visitId} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-fleet-navy">
                    {i === 0 ? "Most recent visit" : `Visit`} · {new Date(first.viewed_at).toLocaleString("en-GB")}
                  </span>
                  <span className="text-xs text-fleet-ink">{visit.views.length} page(s) · {formatDuration(durationMs)}</span>
                </div>
                {focus && (
                  <div className="text-xs text-fleet-ink">
                    Spent the most time on: <span className="font-bold text-fleet-navy">{focus[0]}</span> ({focus[1]}×)
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {visit.views.map((v, j) => (
                    <span
                      key={j}
                      className="rounded-full border border-fleet-border px-2.5 py-1 text-3xs font-bold text-fleet-navy"
                      title={new Date(v.viewed_at).toLocaleString("en-GB")}
                    >
                      {labelForPath(v.path, boatPrefix)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
