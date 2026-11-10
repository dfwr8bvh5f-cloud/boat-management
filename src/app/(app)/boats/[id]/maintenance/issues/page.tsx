import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { IssuesManager } from "@/components/issues-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { Issue } from "@/lib/types/database";

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const [issues, { data: technicians }] = await Promise.all([
    fetchAllRows<Issue>((from, to) =>
      supabase.from("issues").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }).range(from, to)
    ),
    supabase.from("technicians").select("*").order("name"),
  ]);

  const issueIds = issues.map((i) => i.id);
  const { data: attachments } = issueIds.length
    ? await supabase.from("issue_attachments").select("*").in("issue_id", issueIds).order("created_at")
    : { data: [] };

  const issuePaths = [
    ...new Set([
      ...issues.flatMap((i) => [i.photo_path, i.quote_path].filter((p): p is string => Boolean(p))),
      ...(attachments ?? []).map((a) => a.file_path),
    ]),
  ];
  // Quote attachments can be PDFs, which the image-transform thumbnail
  // service can't resize - only photos (never quotes) get a thumb variant.
  const photoOnlyPaths = [
    ...new Set([
      ...issues.flatMap((i) => (i.photo_path ? [i.photo_path] : [])),
      ...(attachments ?? []).filter((a) => a.kind === "photo").map((a) => a.file_path),
    ]),
  ];
  const [signedUrlByPath, thumbUrlByPath] = await Promise.all([
    getCachedSignedUrls("issue-attachments", issuePaths),
    getCachedThumbUrls("issue-attachments", photoOnlyPaths),
  ]);
  const withUrls = issues.map((issue) => ({
    ...issue,
    photoUrl: (issue.photo_path && signedUrlByPath.get(issue.photo_path)) ?? null,
    photoThumbUrl: (issue.photo_path && thumbUrlByPath.get(issue.photo_path)) ?? null,
    quoteUrl: (issue.quote_path && signedUrlByPath.get(issue.quote_path)) ?? null,
    attachments: (attachments ?? [])
      .filter((a) => a.issue_id === issue.id && signedUrlByPath.has(a.file_path))
      .map((a) => ({ id: a.id, kind: a.kind as "photo" | "quote", path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
  }));

  // Latest recorded hours per machine (weekly engine reports) for the printed
  // client report - same lookup as the Technical Specs page.
  const { data: machineSpecs } = await supabase
    .from("technical_specs")
    .select("id, name")
    .eq("boat_id", boat.id)
    .eq("category", "machine")
    .eq("status", "approved")
    .order("name");
  const machineSpecList = (machineSpecs ?? []).filter((s) => !s.name.trim().toLowerCase().startsWith("gearbox"));
  const { data: entryRows } = machineSpecList.length
    ? await supabase
        .from("weekly_engine_report_entries")
        .select("technical_spec_id, hours, report_id")
        .in("technical_spec_id", machineSpecList.map((s) => s.id))
    : { data: [] };
  const entryReportIds = [...new Set((entryRows ?? []).map((e) => e.report_id))];
  const { data: reportRows } = entryReportIds.length
    ? await supabase.from("weekly_engine_reports").select("id, week_of").in("id", entryReportIds)
    : { data: [] };
  const weekOfByReportId = new Map((reportRows ?? []).map((r) => [r.id, r.week_of]));
  const latestBySpec = new Map<string, { hours: number; weekOf: string }>();
  for (const e of entryRows ?? []) {
    const weekOf = weekOfByReportId.get(e.report_id);
    if (e.hours == null || !weekOf) continue;
    const cur = latestBySpec.get(e.technical_spec_id);
    if (!cur || weekOf > cur.weekOf) latestBySpec.set(e.technical_spec_id, { hours: e.hours, weekOf });
  }
  const machines = machineSpecList.flatMap((s) => {
    const latest = latestBySpec.get(s.id);
    return latest ? [{ name: s.name, hours: latest.hours, weekOf: latest.weekOf }] : [];
  });
  const logoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <IssuesManager
      boatId={boat.id}
      issues={withUrls}
      technicians={technicians ?? []}
      canAdd={canEdit}
      canCycle={profile.role === "management" || profile.role === "captain"}
      isManagement={profile.role === "management"}
      locale={locale}
      printReport={{ boatName: boat.name, logoUrl, machines }}
    />
  );
}
