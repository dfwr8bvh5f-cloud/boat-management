import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildIssuePhotoMap, getIssuesReportExtras } from "@/lib/issues-report-data";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { IssuesPrintDocument } from "@/components/issues-print-document";
import { PrintButton } from "@/components/print-button";
import { getLocale } from "@/lib/i18n/locale";
import type { Issue } from "@/lib/types/database";

// The client-facing technical report: job progress, engine / generator hours
// and fuel status on one page the boat's owner can open (the layout's tabs
// are visible to owners too), with the same document printable / savable as
// PDF. Owners only ever receive approved issues (RLS), and the document
// itself also leaves out unapproved drafts and cancelled jobs.
export default async function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat } = await getBoatContext(id);
  const locale = await getLocale();
  const supabase = await createClient();

  const [issues, extras] = await Promise.all([
    fetchAllRows<Issue>((from, to) =>
      supabase.from("issues").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }).range(from, to)
    ),
    getIssuesReportExtras(supabase, boat.id),
  ]);
  // Photos for the jobs that actually appear in the report.
  const reported = issues.filter((i) => i.status === "approved" && i.op_status !== "cancelled");
  const reportedIds = reported.map((i) => i.id);
  const { data: attachments } = reportedIds.length
    ? await supabase.from("issue_attachments").select("issue_id, kind, file_path").in("issue_id", reportedIds).eq("kind", "photo")
    : { data: [] as { issue_id: string; kind: string; file_path: string }[] };
  const photoPaths = [
    ...new Set([
      ...reported.flatMap((i) => (i.photo_path ? [i.photo_path] : [])),
      ...(attachments ?? []).map((a) => a.file_path),
    ]),
  ];
  const [signedUrlByPath, thumbUrlByPath] = await Promise.all([
    getCachedSignedUrls("issue-attachments", photoPaths),
    getCachedThumbUrls("issue-attachments", photoPaths),
  ]);
  const photosByIssueId = buildIssuePhotoMap(reported, attachments ?? [], thumbUrlByPath, signedUrlByPath);
  const logoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  return (
    <div className="flex flex-col gap-4 print:block">
      <div className="flex justify-end print:hidden">
        <PrintButton locale={locale} />
      </div>
      <IssuesPrintDocument
        screen
        boatName={boat.name}
        boatLogoUrl={logoUrl}
        machines={extras.machines}
        fuel={extras.fuel}
        photosByIssueId={photosByIssueId}
        issues={issues}
        locale={locale}
      />
    </div>
  );
}
