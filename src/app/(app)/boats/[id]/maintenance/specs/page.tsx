import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
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

  const photoPaths = [...new Set((specs ?? []).map((s) => s.photo_path).filter((p): p is string => Boolean(p)))];
  const signedUrlByPath = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("technical-spec-photos").createSignedUrls(photoPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const withUrls = (specs ?? []).map((s) => ({
    ...s,
    photoUrl: (s.photo_path && signedUrlByPath.get(s.photo_path)) ?? null,
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
