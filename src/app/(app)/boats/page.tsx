import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { Plus, Ship, Wrench, FileText, ClipboardCheck, Wallet } from "lucide-react";
import { isCashInflow } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";

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
    { data: bankBalances },
    { data: cashTx },
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
    supabase.from("bank_balances").select("boat_id, balance"),
    supabase.from("cash_transactions").select("boat_id, type, amount"),
  ]);

  const pendingFinancialCount = financialPendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const fleetExpiringDocsCount = (expiringDocs ?? []).filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 30).length;

  const openIssuesByBoatId = new Map<string, number>();
  for (const i of openIssuesByBoat ?? []) {
    openIssuesByBoatId.set(i.boat_id, (openIssuesByBoatId.get(i.boat_id) ?? 0) + 1);
  }
  const bankByBoatId = new Map<string, number>();
  for (const b of bankBalances ?? []) {
    bankByBoatId.set(b.boat_id, b.balance);
  }
  const cashNetByBoatId = new Map<string, number>();
  for (const c of cashTx ?? []) {
    const delta = isCashInflow(c.type) ? c.amount : -c.amount;
    cashNetByBoatId.set(c.boat_id, (cashNetByBoatId.get(c.boat_id) ?? 0) + delta);
  }

  const boatsWithLogo = await Promise.all(
    (boats ?? []).map(async (boat) => {
      if (!boat.logo_path) return { ...boat, logoUrl: null };
      const { data } = await supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600);
      return { ...boat, logoUrl: data?.signedUrl ?? null };
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
        <h1 className="text-2xl font-bold text-fleet-navy">{t("fleet_title")}</h1>
        <Link
          href="/boats/new"
          className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-3.5 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          <Plus size={15} /> {t("add_boat")}
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-bold text-fleet-ink">{t("fleet_overview")}</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Link
            href="/approvals"
            className={`rounded-xl border p-2.5 hover:shadow-sm ${(pendingIssuesCount ?? 0) > 0 ? "border-fleet-brass bg-[#EEF2F6]" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <Wrench size={13} /> {t("approvals_technical")}
            </div>
            <div className={`mt-1 text-lg font-bold ${(pendingIssuesCount ?? 0) > 0 ? "text-fleet-brass" : "text-fleet-moss"}`}>
              {pendingIssuesCount ?? 0}
            </div>
          </Link>
          <Link
            href="/approvals"
            className={`rounded-xl border p-2.5 hover:shadow-sm ${pendingFinancialCount > 0 ? "border-fleet-brass bg-[#EEF2F6]" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <Wallet size={13} /> {t("approvals_financial")}
            </div>
            <div className={`mt-1 text-lg font-bold ${pendingFinancialCount > 0 ? "text-fleet-brass" : "text-fleet-moss"}`}>
              {pendingFinancialCount}
            </div>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-fleet-border bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <ClipboardCheck size={13} /> {t("open_issues")}
            </div>
            <div className={`mt-1 text-lg font-bold ${(fleetOpenIssuesCount ?? 0) > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {fleetOpenIssuesCount ?? 0}
            </div>
          </div>
          <div className={`rounded-xl border p-2.5 ${fleetExpiringDocsCount > 0 ? "border-fleet-coral bg-fleet-coral/10" : "border-fleet-border bg-white"}`}>
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <FileText size={13} /> {t("expiring_soon")}
            </div>
            <div className={`mt-1 text-lg font-bold ${fleetExpiringDocsCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
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
              <Link
                key={boat.id}
                href={`/boats/${boat.id}`}
                style={boat.indent ? { marginInlineStart: 22 } : undefined}
                className="flex flex-col gap-1.5 rounded-xl border border-fleet-border bg-white p-3 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-fleet-paper">
                      {boat.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={boat.logoUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <Ship size={17} className="text-fleet-brass" />
                      )}
                    </div>
                    <h2 className="font-bold text-fleet-navy">
                      {boat.indent && <span className="me-1 text-fleet-brass">↳</span>}
                      {boat.name}
                    </h2>
                  </div>
                  <StatusBadge value={boat.status} locale={locale} />
                </div>

                {!isForSale && (
                  <div className="text-xs">
                    <span className={boatOpenIssues > 0 ? "font-bold text-fleet-coral" : "text-fleet-ink"}>
                      {boatOpenIssues} {t("open_issues")}
                    </span>
                  </div>
                )}

                {!isForSale && (
                  <div className="text-xs text-fleet-ink">
                    {t("bank_balance")}:{" "}
                    <span className={boatBank < 5000 ? "font-bold text-fleet-coral" : ""}>{formatCurrency(boatBank)}</span>
                    {" · "}
                    {t("cash_balance")}:{" "}
                    <span className={boatCashNet < 0 ? "font-bold text-fleet-coral" : "text-fleet-moss"}>{formatCurrency(boatCashNet)}</span>
                  </div>
                )}

                {(boat.model || boat.length_meters || boat.beam_meters) && (
                  <div className="text-xs text-fleet-ink">
                    {[boat.model, boat.length_meters && `${boat.length_meters}m`, boat.beam_meters && `${boat.beam_meters}m`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </Link>
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
