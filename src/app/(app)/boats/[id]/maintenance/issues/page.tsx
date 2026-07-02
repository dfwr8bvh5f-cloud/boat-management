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

  const withUrls = await Promise.all(
    (issues ?? []).map(async (issue) => {
      const [photoUrl, quoteUrl] = await Promise.all([
        issue.photo_path
          ? supabase.storage.from("issue-attachments").createSignedUrl(issue.photo_path, 3600)
          : Promise.resolve({ data: null }),
        issue.quote_path
          ? supabase.storage.from("issue-attachments").createSignedUrl(issue.quote_path, 3600)
          : Promise.resolve({ data: null }),
      ]);
      return { ...issue, photoUrl: photoUrl.data?.signedUrl ?? null, quoteUrl: quoteUrl.data?.signedUrl ?? null };
    })
  );

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
