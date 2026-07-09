import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { IssuesManager } from "@/components/issues-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function IssuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

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
  const signedUrlByPath = new Map<string, string>();
  if (issuePaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("issue-attachments").createSignedUrls(issuePaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const withUrls = (issues ?? []).map((issue) => ({
    ...issue,
    photoUrl: (issue.photo_path && signedUrlByPath.get(issue.photo_path)) ?? null,
    quoteUrl: (issue.quote_path && signedUrlByPath.get(issue.quote_path)) ?? null,
    attachments: (attachments ?? [])
      .filter((a) => a.issue_id === issue.id && signedUrlByPath.has(a.file_path))
      .map((a) => ({ id: a.id, kind: a.kind as "photo" | "quote", path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
  }));

  return (
    <IssuesManager
      boatId={boat.id}
      issues={withUrls}
      canAdd={canEdit}
      canCycle={profile.role === "management" || profile.role === "captain"}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
