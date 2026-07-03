import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/staff-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_visible")
    .select("*")
    .eq("boat_id", boat.id)
    .order("start_date");

  const staffPaths = [
    ...new Set((staff ?? []).flatMap((m) => [m.photo_path, m.resume_path].filter((p): p is string => Boolean(p)))),
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
