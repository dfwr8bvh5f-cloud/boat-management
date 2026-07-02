import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { addCatalogPhoto, removeCatalogPhoto } from "@/lib/actions/catalog";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: photos } = await supabase
    .from("catalog_photos")
    .select("*")
    .eq("boat_id", boat.id)
    .order("created_at", { ascending: false });

  const withUrls = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from("catalog").createSignedUrl(p.photo_path, 3600);
      return { ...p, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="flex flex-col gap-4">
      {profile.role === "owner" && (
        <p className="rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm text-fleet-ink">צפייה בלבד.</p>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <label className="mb-1.5 block text-xs text-fleet-ink">מחיר מבוקש</label>
        <div className="text-xl font-bold text-fleet-teal">
          {boat.sale_price != null ? `₪${boat.sale_price.toLocaleString("he-IL")}` : "לא הוגדר מחיר"}
        </div>
        {canEdit && <p className="mt-1 text-xs text-fleet-ink">ניתן לעדכן מחיר בלשונית &quot;סקירה&quot;.</p>}
      </div>

      {canEdit && (
        <form
          action={addCatalogPhoto.bind(null, boat.id)}
          encType="multipart/form-data"
          className="flex items-center gap-2 rounded-xl border border-dashed border-fleet-brass bg-white p-4"
        >
          <input name="photo" type="file" accept="image/*" required className="text-sm" />
          <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
            הוסף תמונה לקטלוג
          </button>
        </form>
      )}

      {withUrls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין תמונות בקטלוג עדיין.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {withUrls.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-xl border border-fleet-border">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-32 w-full object-cover" />
              )}
              {canEdit && (
                <form action={removeCatalogPhoto.bind(null, boat.id, p.id, p.photo_path)} className="absolute top-1.5 end-1.5">
                  <ConfirmSubmitButton
                    confirmMessage="להסיר את התמונה?"
                    className="rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-fleet-coral"
                  >
                    הסר
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
