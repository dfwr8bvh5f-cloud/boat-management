import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls, getCachedThumbUrls } from "@/lib/storage-cache";
import { TechnicalSpecsManager } from "@/components/technical-specs-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function TechnicalSpecsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: specs } = await supabase
    .from("technical_specs")
    .select("*")
    .eq("boat_id", boat.id)
    .order("category")
    .order("created_at");

  // Spec photos only ever render at 36-96px (list icon / edit-form preview,
  // never a lightbox) - a small transformed rendition covers both. Falls
  // back to the plain signed URL if the transform ever comes back empty.
  const photoPaths = [...new Set((specs ?? []).map((s) => s.photo_path).filter((p): p is string => Boolean(p)))];
  const [thumbUrlByPath, fullUrlByPath] = await Promise.all([
    getCachedThumbUrls("technical-spec-photos", photoPaths),
    getCachedSignedUrls("technical-spec-photos", photoPaths),
  ]);
  const signedUrlByPath = new Map<string, string>();
  for (const p of photoPaths) {
    const url = thumbUrlByPath.get(p) ?? fullUrlByPath.get(p);
    if (url) signedUrlByPath.set(p, url);
  }

  const machineSpecIds = (specs ?? []).filter((s) => s.category === "machine").map((s) => s.id);
  const { data: entryRows } =
    machineSpecIds.length > 0
      ? await supabase
          .from("weekly_engine_report_entries")
          .select("technical_spec_id, hours, report_id")
          .in("technical_spec_id", machineSpecIds)
      : { data: [] };

  const reportIds = [...new Set((entryRows ?? []).map((e) => e.report_id))];
  const { data: reportRows } =
    reportIds.length > 0
      ? await supabase.from("weekly_engine_reports").select("id, week_of").in("id", reportIds)
      : { data: [] };
  const weekOfByReportId = new Map((reportRows ?? []).map((r) => [r.id, r.week_of]));

  const latestHoursBySpec = new Map<string, { hours: number; weekOf: string }>();
  for (const e of entryRows ?? []) {
    const weekOf = weekOfByReportId.get(e.report_id);
    if (e.hours == null || !weekOf) continue;
    const current = latestHoursBySpec.get(e.technical_spec_id);
    if (!current || weekOf > current.weekOf) latestHoursBySpec.set(e.technical_spec_id, { hours: e.hours, weekOf });
  }

  const withUrls = (specs ?? []).map((s) => ({
    ...s,
    photoUrl: (s.photo_path && signedUrlByPath.get(s.photo_path)) ?? null,
    operationHours: latestHoursBySpec.get(s.id)?.hours ?? null,
  }));

  return (
    <TechnicalSpecsManager
      boatId={boat.id}
      specs={withUrls}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
