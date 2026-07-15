import Image from "next/image";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { addCatalogPhoto, removeCatalogPhoto } from "@/lib/actions/catalog";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getTranslator } from "@/lib/i18n/locale";

export default async function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const { t } = await getTranslator();

  const supabase = await createClient();
  const { data: photos } = await supabase
    .from("catalog_photos")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  const photoPaths = [...new Set((photos ?? []).map((p) => p.photo_path))];
  const signedUrlByPath = await getCachedSignedUrls("catalog", photoPaths);
  const withUrls = (photos ?? []).map((p) => ({
    ...p,
    url: signedUrlByPath.get(p.photo_path) ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm text-fleet-ink">{t("owner_view_only")}</p>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <label className="mb-1.5 block text-xs text-fleet-ink">{t("catalog_price")}</label>
        <div className="text-xl font-bold text-fleet-teal">
          {boat.sale_price != null ? `€${boat.sale_price.toLocaleString("he-IL")}` : t("catalog_no_price")}
        </div>
        {canEdit && <p className="mt-1 text-xs text-fleet-ink">{t("catalog_price_hint")}</p>}
      </div>

      {canEdit && (
        <form
          action={addCatalogPhoto.bind(null, boat.id)}
          encType="multipart/form-data"
          className="flex items-center gap-2 rounded-xl border border-dashed border-fleet-brass bg-white p-4"
        >
          <input name="photo" type="file" accept="image/*" required className="text-sm" />
          <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
            {t("add_photo")}
          </button>
        </form>
      )}

      {withUrls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_catalog")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {withUrls.map((p) => (
            <div key={p.id} className="relative h-32 w-full overflow-hidden rounded-xl border border-fleet-border">
              {p.url && (
                <Image src={p.url} alt="" fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
              )}
              {canEdit && (
                <form action={removeCatalogPhoto.bind(null, boat.id, p.id, p.photo_path)} className="absolute top-1.5 end-1.5">
                  <ConfirmSubmitButton
                    confirmMessage={t("catalog_remove_confirm")}
                    className="rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-fleet-coral"
                  >
                    {t("remove_word")}
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
