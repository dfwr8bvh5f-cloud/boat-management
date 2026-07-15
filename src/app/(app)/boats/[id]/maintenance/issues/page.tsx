import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { IssuesManager } from "@/components/issues-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const [{ data: issues }, { data: technicians }] = await Promise.all([
    supabase.from("issues").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }),
    supabase.from("technicians").select("*").order("name"),
  ]);

  const issueIds = (issues ?? []).map((i) => i.id);
  const { data: attachments } = issueIds.length
    ? await supabase.from("issue_attachments").select("*").in("issue_id", issueIds).order("created_at")
    : { data: [] };

  const issuePaths = [
    ...new Set([
      ...(issues ?? []).flatMap((i) => [i.photo_path, i.quote_path].filter((p): p is string => Boolean(p))),
      ...(attachments ?? []).map((a) => a.file_path),
    ]),
  ];
  // Quote attachments can be PDFs, which the image-transform thumbnail
  // service can't resize - only photos (never quotes) get a thumb variant.
  const photoOnlyPaths = [
    ...new Set([
      ...(issues ?? []).flatMap((i) => (i.photo_path ? [i.photo_path] : [])),
      ...(attachments ?? []).filter((a) => a.kind === "photo").map((a) => a.file_path),
    ]),
  ];
  const [signedUrlByPath, thumbUrlByPath] = await Promise.all([
    getCachedSignedUrls("issue-attachments", issuePaths),
    getCachedThumbUrls("issue-attachments", photoOnlyPaths),
  ]);
  const withUrls = (issues ?? []).map((issue) => ({
    ...issue,
    photoUrl: (issue.photo_path && signedUrlByPath.get(issue.photo_path)) ?? null,
    photoThumbUrl: (issue.photo_path && thumbUrlByPath.get(issue.photo_path)) ?? null,
    quoteUrl: (issue.quote_path && signedUrlByPath.get(issue.quote_path)) ?? null,
    attachments: (attachments ?? [])
      .filter((a) => a.issue_id === issue.id && signedUrlByPath.has(a.file_path))
      .map((a) => ({ id: a.id, kind: a.kind as "photo" | "quote", path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
  }));

  return (
    <IssuesManager
      boatId={boat.id}
      issues={withUrls}
      technicians={technicians ?? []}
      canAdd={canEdit}
      canCycle={profile.role === "management" || profile.role === "captain"}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
