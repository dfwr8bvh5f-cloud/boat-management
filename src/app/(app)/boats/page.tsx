import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { BoatPhotoGallery, type GalleryPhoto } from "@/components/boat-photo-gallery";
import { QuickExpenseForm } from "@/components/quick-expense-form";
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
    expiringDocs,
    openIssuesByBoat,
    incomesAll,
    cashTxAll,
    expensesAll,
    { data: galleryAll },
  ] = await Promise.all([
    supabase.from("boats").select("*").order("name"),
    supabase.from("issues").select("id", { count: "exact", head: true }).eq("status", "pending"),
    Promise.all(
      (["expenses", "staff", "incomes", "cash_transactions"] as const).map((table) =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")
      )
    ),
    supabase.from("issues").select("id", { count: "exact", head: true }).not("op_status", "in", "(completed,cancelled)"),
    fetchAllRows<{ id: string; expiry_date: string | null }>((from, to) =>
      supabase.from("documents").select("id, expiry_date").not("expiry_date", "is", null).range(from, to)
    ),
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

  // One batched call for every boat-photos path across the whole fleet,
  // instead of a separate signed-URL request per logo/image/gallery photo
  // per boat - that N+1 pattern was the main reason this page was slow to
  // load with more than a few boats.
  const allPaths = new Set<string>();
  for (const boat of boats ?? []) {
    if (boat.logo_path) allPaths.add(boat.logo_path);
    if (boat.image_path) allPaths.add(boat.image_path);
  }
  for (const p of galleryAll ?? []) allPaths.add(p.photo_path);

  const signedUrlByPath = new Map<string, string>();
  if (allPaths.size > 0) {
    const { data: signedUrls } = await supabase.storage.from("boat-photos").createSignedUrls([...allPaths], 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  const boatsWithLogo = (boats ?? []).map((boat) => {
    const boatGallery = galleryByBoatId.get(boat.id) ?? [];
    return {
      ...boat,
      logoUrl: (boat.logo_path && signedUrlByPath.get(boat.logo_path)) ?? null,
      imageUrl: (boat.image_path && signedUrlByPath.get(boat.image_path)) ?? null,
      galleryPhotos: boatGallery.map((p) => ({
        id: p.id,
        path: p.photo_path,
        url: signedUrlByPath.get(p.photo_path) ?? "",
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

  // Sub-boats don't run their own finance (same rule as the per-boat quick
  // expense shortcut), so they're left out of the fleet-wide picker.
  const expenseBoats = (boats ?? [])
    .filter((b) => !b.parent_boat_id)
    .map((b) => ({ id: b.id, name: b.name, boat_type: b.boat_type }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
            className={`rounded-xl border p-2 hover:shadow-sm ${(pendingIssuesCount ?? 0) > 0 ? "border-fleet-brass bg-fleet-highlight" : "border-fleet-border bg-white"}`}
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
            className={`rounded-xl border p-2 hover:shadow-sm ${pendingFinancialCount > 0 ? "border-fleet-brass bg-fleet-highlight" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <Wallet size={11} className="shrink-0" /> <span>{t("approvals_financial")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${pendingFinancialCount > 0 ? "text-fleet-brass" : "text-fleet-moss"}`}>
              {pendingFinancialCount}
            </div>
          </Link>
          <Link
            href="/issues"
            className={`rounded-xl border p-2 hover:shadow-sm ${(fleetOpenIssuesCount ?? 0) > 0 ? "border-fleet-coral bg-fleet-coral/5" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-[10px] leading-tight text-fleet-ink">
              <ClipboardCheck size={11} className="shrink-0" /> <span>{t("open_issues")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${(fleetOpenIssuesCount ?? 0) > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {fleetOpenIssuesCount ?? 0}
            </div>
          </Link>
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

      {expenseBoats.length > 0 && <QuickExpenseForm boats={expenseBoats} locale={locale} />}

      {orderedBoats.length > 0 ? (
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
                        className={`object-contain ${isInactive ? "grayscale" : ""}`}
                      />
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
                    <div className="relative flex aspect-[4/3] w-32 shrink-0 cursor-pointer self-center">
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
                            sizes="128px"
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
      ) : (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-10 text-center text-sm text-fleet-ink">
          {t("no_boats")}
        </p>
      )}
    </div>
  );
}
