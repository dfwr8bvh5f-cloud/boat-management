import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/staff-manager";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_visible")
    .select("*")
    .eq("boat_id", boat.id)
    .order("start_date");

  const withUrls = await Promise.all(
    (staff ?? []).map(async (m) => {
      const [photo, resume] = await Promise.all([
        m.photo_path
          ? supabase.storage.from("staff-files").createSignedUrl(m.photo_path, 3600)
          : Promise.resolve({ data: null }),
        m.resume_path
          ? supabase.storage.from("staff-files").createSignedUrl(m.resume_path, 3600)
          : Promise.resolve({ data: null }),
      ]);
      return { ...m, photoUrl: photo.data?.signedUrl ?? null, resumeUrl: resume.data?.signedUrl ?? null };
    })
  );

  return (
    <StaffManager
      boatId={boat.id}
      staff={withUrls}
      canAdd={canEdit}
      canSeeSalary={profile.role === "management" || profile.role === "owner"}
      isManagement={profile.role === "management"}
    />
  );
}
