import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BoatPhotoGallery, type GalleryPhoto } from "@/components/boat-photo-gallery";
import { Plus, Ship, Camera, Wrench, FileText, ClipboardCheck, Wallet } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";
import type { BoatGalleryPhoto } from "@/lib/types/database";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default async function BoatsPage() {
  const profile = await requireProfile();

  if (profile.role !== "management") {
    redirect(profile.boat_id ? `/boats/${profile.boat_id}` : "/");
  }

  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const [
    { data: boats },
    { count: pendingIssuesCount },
    financialPendingCounts,
    { count: fleetOpenIssuesCount },
    { data: expiringDocs },
    { data: openIssuesByBoat },
    { data: incomesAll },
    { data: cashTxAll },
    { data: expensesAll },
  ] = await Promise.all([
    supabase.from("boats").select("*").order("name"),
    supabase.from("issues").select("id", { count: "exact", head: true }).eq("status", "pending"),
    Promise.all(
      (["expenses", "staff", "incomes", "cash_transactions"] as const).map((table) =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")
      )
    ),
    supabase.from("issues").select("id", { count: "exact", head: true }).not("op_status", "in", "(completed,cancelled)"),
    supabase.from("documents").select("id, expiry_date").not("expiry_date", "is", null),
    supabase.from("issues").select("boat_id").not("op_status", "in", "(completed,cancelled)"),
    supabase.from("incomes").select("boat_id, amount").eq("status", "approved").eq("type", "actual"),
    supabase.from("cash_transactions").select("boat_id, type, amount").eq("status", "approved"),
    supabase.from("expenses").select("boat_id, amount, payment_method").eq("status", "approved"),
  ]);

  const { data: galleryAll } = await supabase.from("boat_gallery_photos").select("*").order("created_at");
  const galleryByBoatId = new Map<string, BoatGalleryPhoto[]>();
  for (const p of galleryAll ?? []) {
    const list = galleryByBoatId.get(p.boat_id) ?? [];
    list.push(p);
    galleryByBoatId.set(p.boat_id, list);
  }

  const pendingFinancialCount = financialPendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const fleetExpiringDocsCount = (expiringDocs ?? []).filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 30).length;

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

  const boatsWithLogo = await Promise.all(
    (boats ?? []).map(async (boat) => {
      const boatGallery = galleryByBoatId.get(boat.id) ?? [];
      const [logoResult, imageResult, galleryUrls] = await Promise.all([
        boat.logo_path
          ? supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
          : Promise.resolve({ data: null }),
        boat.image_path
          ? supabase.storage.from("boat-photos").createSignedUrl(boat.image_path, 3600)
          : Promise.resolve({ data: null }),
        Promise.all(
          boatGallery.map(async (p) => {
            const { data } = await supabase.storage.from("boat-photos").createSignedUrl(p.photo_path, 3600);
            return { id: p.id, path: p.photo_path, url: data?.signedUrl ?? "" };
          })
        ),
      ]);
      return {
        ...boat,
        logoUrl: logoResult.data?.signedUrl ?? null,
        imageUrl: imageResult.data?.signedUrl ?? null,
        galleryPhotos: galleryUrls as GalleryPhoto[],
      };
    })
  );

  // Order top-level boats first, each immediately followed by its own
  // sub-boats (indented) - matches the demo's fleet list grouping. Within
  // the top level: commercial boats first, then private, then for-sale
  // last; within each type, most active boats come first.
  const TYPE_RANK: Record<string, number> = { commercial: 0, private: 1, for_sale: 2 };
  const STATUS_RANK: Record<string, number> = { active: 0, maintenance: 1, inactive: 2 };
  const orderedBoats: (typeof boatsWithLogo[number] & { indent: boolean })[] = [];
  const topLevel = boatsWithLogo
    .filter((b) => !b.parent_boat_id)
    .sort((a, b) => {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide text-fleet-navy">{t("fleet_title")}</h1>
        <Link
          href="/boats/new"
          className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-3.5 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          <Plus size={15} /> {t("add_boat")}
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-bold text-fleet-ink">{t("fleet_overview")}</div>
        <div className="grid grid-cols-4 gap-1.5">
          <Link
            href="/approvals"
            className={`rounded-xl border p-2 hover:shadow-sm ${(pendingIssuesCount ?? 0) > 0 ? "border-fleet-brass bg-[#EEF2F6]" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <Wrench size={11} className="shrink-0" /> <span>{t("approvals_technical")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${(pendingIssuesCount ?? 0) > 0 ? "text-fleet-brass" : "text-fleet-moss"}`}>
              {pendingIssuesCount ?? 0}
            </div>
          </Link>
          <Link
            href="/approvals"
            className={`rounded-xl border p-2 hover:shadow-sm ${pendingFinancialCount > 0 ? "border-fleet-brass bg-[#EEF2F6]" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <Wallet size={11} className="shrink-0" /> <span>{t("approvals_financial")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${pendingFinancialCount > 0 ? "text-fleet-brass" : "text-fleet-moss"}`}>
              {pendingFinancialCount}
            </div>
          </Link>
          <div className="rounded-xl border border-fleet-border bg-white p-2">
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <ClipboardCheck size={11} className="shrink-0" /> <span>{t("open_issues")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${(fleetOpenIssuesCount ?? 0) > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {fleetOpenIssuesCount ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-fleet-border bg-white p-2">
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <FileText size={11} className="shrink-0" /> <span>{t("expiring_soon")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${fleetExpiringDocsCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {fleetExpiringDocsCount}
            </div>
          </div>
        </div>
      </div>

      {orderedBoats.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orderedBoats.map((boat) => {
            const boatOpenIssues = openIssuesByBoatId.get(boat.id) ?? 0;
            const boatBank = bankByBoatId.get(boat.id) ?? 0;
            const boatCashNet = cashNetByBoatId.get(boat.id) ?? 0;
            const isForSale = boat.boat_type === "for_sale";
            return (
              <div
                key={boat.id}
                style={boat.indent ? { marginInlineStart: 22 } : undefined}
                className="flex items-stretch gap-2 rounded-xl border border-fleet-border bg-white p-3 transition-shadow hover:shadow-sm"
              >
                <Link href={`/boats/${boat.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper">
                    {boat.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={boat.logoUrl} alt="" className="h-full w-full object-fill" />
                    ) : (
                      <Ship size={17} className="text-fleet-brass" />
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
                        <span className={boatOpenIssues > 0 ? "font-bold text-fleet-coral" : "text-fleet-ink"}>
                          {boatOpenIssues} {t("open_issues")}
                        </span>
                      </div>
                    )}

                    {!isForSale && !boat.parent_boat_id && (
                      <div className="flex flex-col text-xs text-fleet-ink">
                        <span>
                          {t("bank_balance")}:{" "}
                          <span className={boatBank < 5000 ? "font-bold text-fleet-coral" : ""}>{formatCurrency(boatBank)}</span>
                        </span>
                        <span>
                          {t("cash_balance")}:{" "}
                          <span className={boatCashNet < 0 ? "font-bold text-fleet-coral" : "text-fleet-moss"}>{formatCurrency(boatCashNet)}</span>
                        </span>
                      </div>
                    )}

                    {(boat.model || boat.length_meters || boat.beam_meters) && (
                      <div className="text-xs text-fleet-ink">
                        {[boat.model, boat.length_meters && `${boat.length_meters}m`, boat.beam_meters && `${boat.beam_meters}m`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
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
                    <div className="relative flex h-full w-28 shrink-0 cursor-pointer">
                      <span
                        className={`absolute -left-1 -top-1 z-10 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                          boat.status === "active"
                            ? "bg-fleet-moss"
                            : boat.status === "maintenance"
                              ? "bg-fleet-brass"
                              : "bg-fleet-ink"
                        }`}
                      />
                      <div
                        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-fleet-paper ${
                          boat.imageUrl ? "" : "border border-dashed border-fleet-brass"
                        }`}
                      >
                        {boat.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={boat.imageUrl} alt="" className="h-full w-full object-cover" />
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
      ) : (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-10 text-center text-sm text-fleet-ink">
          {t("no_boats")}
        </p>
      )}
    </div>
  );
}
