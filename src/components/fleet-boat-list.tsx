import Link from "next/link";
import Image from "next/image";
import { Ship, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { BoatPhotoGallery, type GalleryPhoto } from "@/components/boat-photo-gallery";
import { getTranslator } from "@/lib/i18n/locale";
import { formatCurrency } from "@/lib/money";
import type { Boat, BoatGalleryPhoto } from "@/lib/types/database";
import type { Locale } from "@/lib/i18n/dictionaries";

// Split out of the fleet page's main render so its own Suspense boundary
// can stream in after the fast fleet-overview tiles and quick-add forms
// above it - the per-boat bank/cash figures below need a fleet-wide scan
// of every boat's incomes/cash transactions/expenses (2800+ rows and
// growing), by far the slowest data on that page.
export async function FleetBoatList({ boats, locale }: { boats: Boat[]; locale: Locale }) {
  const { t } = await getTranslator();
  const supabase = await createClient();

  const [openIssuesByBoat, incomesAll, cashTxAll, expensesAll, { data: galleryAll }] = await Promise.all([
    fetchAllRows<{ boat_id: string }>((from, to) =>
      supabase.from("issues").select("boat_id").not("op_status", "in", "(completed,cancelled)").range(from, to)
    ),
    fetchAllRows<{ boat_id: string; amount: number }>((from, to) =>
      supabase
        .from("incomes")
        .select("boat_id, amount")
        .eq("status", "approved")
        .eq("type", "actual")
        .is("archived_at", null)
        .range(from, to)
    ),
    fetchAllRows<{ boat_id: string; type: string; amount: number }>((from, to) =>
      supabase
        .from("cash_transactions")
        .select("boat_id, type, amount")
        .eq("status", "approved")
        .is("archived_at", null)
        .range(from, to)
    ),
    fetchAllRows<{ boat_id: string; amount: number; payment_method: string | null }>((from, to) =>
      supabase
        .from("expenses")
        .select("boat_id, amount, payment_method")
        .eq("status", "approved")
        .is("archived_at", null)
        .range(from, to)
    ),
    supabase.from("boat_gallery_photos").select("*").order("created_at"),
  ]);

  const galleryByBoatId = new Map<string, BoatGalleryPhoto[]>();
  for (const p of galleryAll ?? []) {
    const list = galleryByBoatId.get(p.boat_id) ?? [];
    list.push(p);
    galleryByBoatId.set(p.boat_id, list);
  }

  const openIssuesByBoatId = new Map<string, number>();
  for (const i of openIssuesByBoat ?? []) {
    openIssuesByBoatId.set(i.boat_id, (openIssuesByBoatId.get(i.boat_id) ?? 0) + 1);
  }
  const bankByBoatId = new Map<string, number>();
  for (const i of incomesAll ?? []) {
    bankByBoatId.set(i.boat_id, (bankByBoatId.get(i.boat_id) ?? 0) + i.amount);
  }
  const cashNetByBoatId = new Map<string, number>();
  for (const c of cashTxAll ?? []) {
    if (c.type === "withdrawal") {
      bankByBoatId.set(c.boat_id, (bankByBoatId.get(c.boat_id) ?? 0) - c.amount);
    }
    if (c.type === "withdrawal" || c.type === "received") {
      cashNetByBoatId.set(c.boat_id, (cashNetByBoatId.get(c.boat_id) ?? 0) + c.amount);
    }
  }
  for (const e of expensesAll ?? []) {
    if (e.payment_method === "bank_transfer" || e.payment_method === "card") {
      bankByBoatId.set(e.boat_id, (bankByBoatId.get(e.boat_id) ?? 0) - e.amount);
    }
    if (e.payment_method === "cash") {
      cashNetByBoatId.set(e.boat_id, (cashNetByBoatId.get(e.boat_id) ?? 0) - e.amount);
    }
  }

  // boat-photos is a public bucket, so its URL is a plain, stable string -
  // no signed-URL network round trip needed, and (unlike a signed URL,
  // which carries a fresh one-time token every render) it stays the same
  // across requests, so next/image's own optimizer can actually cache it
  // instead of re-processing it from scratch on every page load.
  const publicUrl = (path: string) => supabase.storage.from("boat-photos").getPublicUrl(path).data.publicUrl;

  const boatsWithLogo = boats.map((boat) => {
    const boatGallery = galleryByBoatId.get(boat.id) ?? [];
    return {
      ...boat,
      logoUrl: boat.logo_path ? publicUrl(boat.logo_path) : null,
      imageUrl: boat.image_path ? publicUrl(boat.image_path) : null,
      galleryPhotos: boatGallery.map((p) => ({
        id: p.id,
        path: p.photo_path,
        url: publicUrl(p.photo_path),
      })) as GalleryPhoto[],
    };
  });

  // Order top-level boats first, each immediately followed by its own
  // sub-boats (indented) - matches the demo's fleet list grouping. Inactive
  // boats always sink to the very end of the list, ahead of everything
  // else; within the rest: commercial boats first, then private, then
  // for-sale last, and within each type maintenance comes after active.
  const TYPE_RANK: Record<string, number> = { commercial: 0, private: 1, for_sale: 2 };
  const STATUS_RANK: Record<string, number> = { active: 0, maintenance: 1, inactive: 2 };
  const orderedBoats: (typeof boatsWithLogo[number] & { indent: boolean })[] = [];
  const topLevel = boatsWithLogo
    .filter((b) => !b.parent_boat_id)
    .sort((a, b) => {
      const inactiveDiff = (a.status === "inactive" ? 1 : 0) - (b.status === "inactive" ? 1 : 0);
      if (inactiveDiff !== 0) return inactiveDiff;
      const typeDiff = (TYPE_RANK[a.boat_type] ?? 0) - (TYPE_RANK[b.boat_type] ?? 0);
      if (typeDiff !== 0) return typeDiff;
      return (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
    });
  for (const b of topLevel) {
    orderedBoats.push({ ...b, indent: false });
    for (const sub of boatsWithLogo.filter((sb) => sb.parent_boat_id === b.id)) {
      orderedBoats.push({ ...sub, indent: true });
    }
  }
  for (const b of boatsWithLogo.filter((b) => b.parent_boat_id && !boatsWithLogo.some((p) => p.id === b.parent_boat_id))) {
    orderedBoats.push({ ...b, indent: false });
  }

  if (orderedBoats.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-10 text-center text-sm text-fleet-ink">
        {t("no_boats")}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {orderedBoats.map((boat) => {
        const boatOpenIssues = openIssuesByBoatId.get(boat.id) ?? 0;
        const boatBank = bankByBoatId.get(boat.id) ?? 0;
        const boatCashNet = cashNetByBoatId.get(boat.id) ?? 0;
        const isForSale = boat.boat_type === "for_sale";
        const isInactive = boat.status === "inactive";
        return (
          <div
            key={boat.id}
            style={boat.indent ? { marginInlineStart: 22 } : undefined}
            className={`flex items-stretch gap-2 rounded-xl border p-3 transition-shadow hover:shadow-sm ${
              isInactive ? "border-fleet-border bg-fleet-paper/70 opacity-70" : "border-fleet-border bg-white"
            }`}
          >
            <Link href={`/boats/${boat.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper">
                {boat.logoUrl ? (
                  <Image
                    src={boat.logoUrl}
                    alt=""
                    fill
                    sizes="36px"
                    unoptimized={false}
                    className={`object-contain ${isInactive ? "grayscale" : ""}`}
                  />
                ) : (
                  <Ship size={16} className="text-fleet-brass" />
                )}
              </div>
              <div className="h-6 w-px shrink-0 bg-fleet-border" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-brand font-bold text-fleet-navy">
                  {boat.indent && <span className="me-1 text-fleet-brass">↳</span>}
                  {boat.name}
                </h2>

                {!isForSale && (
                  <div className="text-xs">
                    <span className={boatOpenIssues > 0 ? "font-bold text-fleet-coral-text" : "text-fleet-ink"}>
                      {boatOpenIssues} {t("open_issues")}
                    </span>
                  </div>
                )}

                {!isForSale && !boat.parent_boat_id && (
                  <div className="flex flex-col text-xs text-fleet-ink">
                    <div className="flex items-baseline gap-1 overflow-hidden">
                      <span className="truncate">{t("bank_balance")}:</span>
                      <span className={`shrink-0 whitespace-nowrap ${boatBank < 5000 ? "font-bold text-fleet-coral-text" : ""}`}>
                        {formatCurrency(boatBank)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 overflow-hidden">
                      <span className="truncate">{t("cash_balance")}:</span>
                      <span className={`shrink-0 whitespace-nowrap ${boatCashNet < 0 ? "font-bold text-fleet-coral-text" : ""}`}>
                        {formatCurrency(boatCashNet)}
                      </span>
                    </div>
                  </div>
                )}

                {boat.model && <div className="text-xs text-fleet-ink">{boat.model}</div>}
              </div>
            </Link>

            <BoatPhotoGallery
              boatId={boat.id}
              photos={boat.galleryPhotos}
              primaryPath={boat.image_path}
              canUpload
              canManage
              locale={locale}
              trigger={
                /* Same aspect ratio/crop/radius as every other boat-photo
                   thumbnail in the app (header gallery cluster, gallery
                   modal grid) - a boat's photo should look consistent
                   wherever it appears. */
                <div className="relative flex aspect-square w-24 shrink-0 cursor-pointer self-center">
                  <div
                    className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-fleet-paper ${
                      boat.imageUrl ? "" : "border border-dashed border-fleet-brass"
                    }`}
                  >
                    {boat.imageUrl ? (
                      <Image
                        src={boat.imageUrl}
                        alt=""
                        fill
                        sizes="96px"
                        unoptimized={false}
                        className={`object-cover ${isInactive ? "grayscale" : ""}`}
                      />
                    ) : (
                      <Camera size={20} className="text-fleet-brass" />
                    )}
                  </div>
                </div>
              }
            />
          </div>
        );
      })}
    </div>
  );
}
