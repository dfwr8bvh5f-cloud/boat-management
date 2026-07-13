import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/staff-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const [{ data: staff }, { data: idDocuments }] = await Promise.all([
    supabase.from("staff_visible").select("*").eq("boat_id", boat.id).order("start_date"),
    supabase.from("staff_id_documents").select("*").eq("boat_id", boat.id).order("created_at"),
  ]);

  const staffPaths = [
    ...new Set([
      ...(staff ?? []).flatMap((m) => [m.photo_path, m.resume_path, m.id_document_path].filter((p): p is string => Boolean(p))),
      ...(idDocuments ?? []).map((d) => d.file_path),
    ]),
  ];
  const signedUrlByPath = new Map<string, string>();
  if (staffPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("staff-files").createSignedUrls(staffPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const withUrls = (staff ?? []).map((m) => ({
    ...m,
    photoUrl: (m.photo_path && signedUrlByPath.get(m.photo_path)) ?? null,
    resumeUrl: (m.resume_path && signedUrlByPath.get(m.resume_path)) ?? null,
    idDocumentUrl: (m.id_document_path && signedUrlByPath.get(m.id_document_path)) ?? null,
    idDocuments: (idDocuments ?? [])
      .filter((d) => d.staff_id === m.id)
      .map((d) => ({ id: d.id, path: d.file_path, url: signedUrlByPath.get(d.file_path) ?? "" })),
  }));

  return (
    <StaffManager
      boatId={boat.id}
      staff={withUrls}
      canAdd={canEdit}
      canSeeSalary={profile.role === "management" || profile.role === "owner"}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
