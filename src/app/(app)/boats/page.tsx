import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { QuickExpenseForm } from "@/components/quick-expense-form";
import { QuickIssueForm } from "@/components/quick-issue-form";
import { FleetBoatList } from "@/components/fleet-boat-list";
import { RippleLoader } from "@/components/ripple-loader";
import { Contact, Plus, Wrench, FileText, ClipboardCheck, Wallet } from "lucide-react";
import { getTranslator } from "@/lib/i18n/locale";

// Roughly matches a real boat card's height so the fleet list streaming in
// doesn't shift the page once it lands.
const FLEET_LIST_SKELETON = (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex h-[92px] items-center justify-center rounded-xl border border-fleet-border bg-white p-3">
        <RippleLoader size="sm" className="text-fleet-border" />
      </div>
    ))}
  </div>
);

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
    { data: technicians },
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
    supabase.from("technicians").select("*").order("name"),
  ]);

  const pendingFinancialCount = financialPendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  const fleetExpiringDocsCount = (expiringDocs ?? []).filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 30).length;

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
          <Plus size={16} /> {t("add_boat")}
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-bold text-fleet-ink">{t("fleet_overview")}</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Link
            href="/approvals?type=technical"
            className={`rounded-xl border p-2 hover:shadow-sm ${(pendingIssuesCount ?? 0) > 0 ? "border-fleet-brass bg-fleet-highlight" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
              <Wrench size={14} className="shrink-0" /> <span>{t("approvals_technical")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${(pendingIssuesCount ?? 0) > 0 ? "text-fleet-brass" : "text-fleet-moss-text"}`}>
              {pendingIssuesCount ?? 0}
            </div>
          </Link>
          <Link
            href="/approvals?type=financial"
            className={`rounded-xl border p-2 hover:shadow-sm ${pendingFinancialCount > 0 ? "border-fleet-brass bg-fleet-highlight" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
              <Wallet size={14} className="shrink-0" /> <span>{t("approvals_financial")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${pendingFinancialCount > 0 ? "text-fleet-brass" : "text-fleet-moss-text"}`}>
              {pendingFinancialCount}
            </div>
          </Link>
          <Link
            href="/issues"
            className={`rounded-xl border p-2 hover:shadow-sm ${(fleetOpenIssuesCount ?? 0) > 0 ? "border-fleet-coral bg-fleet-coral/5" : "border-fleet-border bg-white"}`}
          >
            <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
              <ClipboardCheck size={14} className="shrink-0" /> <span>{t("open_issues")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${(fleetOpenIssuesCount ?? 0) > 0 ? "text-fleet-coral-text" : "text-fleet-moss-text"}`}>
              {fleetOpenIssuesCount ?? 0}
            </div>
          </Link>
          <div className="rounded-xl border border-fleet-border bg-white p-2">
            <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
              <FileText size={14} className="shrink-0" /> <span>{t("expiring_soon")}</span>
            </div>
            <div className={`mt-1 text-base font-bold ${fleetExpiringDocsCount > 0 ? "text-fleet-coral-text" : "text-fleet-moss-text"}`}>
              {fleetExpiringDocsCount}
            </div>
          </div>
        </div>
      </div>

      {expenseBoats.length > 0 && (
        <div className="flex items-stretch gap-2">
          {/* Hebrew is RTL (first DOM child renders rightmost); English/Greek
              are LTR, where the same physical "right" position is the last
              DOM child - order-last flips it there without touching dir. */}
          <Link
            href="/technicians"
            aria-label={t("nav_technicians")}
            title={t("nav_technicians")}
            className={`flex w-28 shrink-0 items-center justify-center rounded-xl border border-fleet-border bg-white text-fleet-navy hover:bg-fleet-paper ${
              locale === "he" ? "" : "order-last"
            }`}
          >
            <Contact size={16} />
          </Link>
          <div className="flex flex-1 flex-col gap-2">
            <QuickExpenseForm boats={expenseBoats} locale={locale} />
            <QuickIssueForm boats={expenseBoats} technicians={technicians ?? []} locale={locale} isManagement />
          </div>
        </div>
      )}

      <Suspense fallback={FLEET_LIST_SKELETON}>
        <FleetBoatList boats={boats ?? []} locale={locale} />
      </Suspense>
    </div>
  );
}
