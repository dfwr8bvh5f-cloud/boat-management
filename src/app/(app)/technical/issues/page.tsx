import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchRowsForIds } from "@/lib/supabase/fetch-all";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { IssuesManager } from "@/components/issues-manager";
import { getLocale } from "@/lib/i18n/locale";
import type { Issue, IssueAttachment } from "@/lib/types/database";

// Same base as a single boat's own Maintenance > Issues page
// (boats/[id]/maintenance/issues/page.tsx) - every issue across every boat,
// instead of one boat_id's worth, with each row carrying its own boat name
// (see IssuesManager's `boats`/`boatName` fleet-mode support).
export default async function TechnicalIssuesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const locale = await getLocale();
  const supabase = await createClient();

  const [issues, { data: boats }, { data: technicians }] = await Promise.all([
    fetchAllRows<Issue>((from, to) => supabase.from("issues").select("*").order("created_at", { ascending: false }).range(from, to)),
    supabase.from("boats").select("id, name").neq("boat_type", "for_sale").order("name"),
    supabase.from("technicians").select("*").order("name"),
  ]);

  const issueIds = issues.map((i) => i.id);
  const attachments = await fetchRowsForIds<IssueAttachment>(issueIds, (chunk) =>
    supabase.from("issue_attachments").select("*").in("issue_id", chunk).order("created_at")
  );

  const issuePaths = [
    ...new Set([
      ...issues.flatMap((i) => [i.photo_path, i.quote_path].filter((p): p is string => Boolean(p))),
      ...attachments.map((a) => a.file_path),
    ]),
  ];
  const photoOnlyPaths = [
    ...new Set([
      ...issues.flatMap((i) => (i.photo_path ? [i.photo_path] : [])),
      ...attachments.filter((a) => a.kind === "photo").map((a) => a.file_path),
    ]),
  ];
  const [signedUrlByPath, thumbUrlByPath] = await Promise.all([
    getCachedSignedUrls("issue-attachments", issuePaths),
    getCachedThumbUrls("issue-attachments", photoOnlyPaths),
  ]);

  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));

  const withUrls = issues.map((issue) => ({
    ...issue,
    boatName: boatNameById.get(issue.boat_id),
    photoUrl: (issue.photo_path && signedUrlByPath.get(issue.photo_path)) ?? null,
    photoThumbUrl: (issue.photo_path && thumbUrlByPath.get(issue.photo_path)) ?? null,
    quoteUrl: (issue.quote_path && signedUrlByPath.get(issue.quote_path)) ?? null,
    attachments: attachments
      .filter((a) => a.issue_id === issue.id && signedUrlByPath.has(a.file_path))
      .map((a) => ({ id: a.id, kind: a.kind as "photo" | "quote", path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
  }));

  return (
    <IssuesManager
      boats={(boats ?? []).map((b) => ({ id: b.id, name: b.name }))}
      issues={withUrls}
      technicians={technicians ?? []}
      canAdd
      canCycle
      isManagement
      locale={locale}
    />
  );
}
