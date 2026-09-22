import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { getCategoryLabels, getCategoryColors, getPaymentLabels, getExpenseCategories } from "@/lib/labels";
import { computeFinancialSnapshot } from "@/lib/report-data";
import { FinancialReportDocument } from "@/components/financial-report-document";
import { ReportActions } from "@/components/report-actions";
import { ReportsManager } from "@/components/reports-manager";
import { DateInput } from "@/components/date-input";
import { todayLocalISO } from "@/lib/date-format";
import { getTranslator } from "@/lib/i18n/locale";

export default async function PeriodReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  const { from: fromParam, to: toParam } = await searchParams;
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const categoryColors = getCategoryColors();
  const paymentLabels = getPaymentLabels(locale);
  const categories = getExpenseCategories(boat.boat_type, boat.name, locale);

  const today = todayLocalISO();
  const from = fromParam || `${today.slice(0, 7)}-01`;
  const to = toParam || today;

  const supabase = await createClient();
  const [snapshot, { data: reports }] = await Promise.all([
    computeFinancialSnapshot(supabase, boat.id, from, to, categories),
    supabase.from("reports").select("*").eq("boat_id", boat.id).eq("type", "financial").order("issued_at", { ascending: false }),
  ]);

  const logoUrl: string | null = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : null;

  // Resolved here (not baked into the snapshot itself) since a signed URL
  // goes stale - re-derived fresh every time this page renders, whether
  // the snapshot was just computed live or read back from an issued
  // report's stored JSON. Every viewer who can reach this page (owner
  // included) sees the same receipts a management viewer would on the
  // boat's own Expenses page - no role gate on the file itself, just on
  // whether this page is reachable at all (finance/layout.tsx).
  const receiptPaths = [
    ...new Set(
      [...snapshot.expenseList, ...(snapshot.unpaidExpenseList ?? [])].flatMap((e) =>
        [e.receiptPath, e.photoPath].filter((p): p is string => Boolean(p))
      )
    ),
  ];
  const receiptUrlByPath = await getCachedSignedUrls("receipts", receiptPaths);

  const issuerIds = [...new Set((reports ?? []).map((r) => r.issued_by).filter((v): v is string => Boolean(v)))];
  const { data: issuers } =
    issuerIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", issuerIds) : { data: [] };
  const issuerNames = Object.fromEntries((issuers ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-fleet-border bg-white p-4 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("from_date")}
          <DateInput
            name="from"
            defaultValue={from}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fleet-ink">
          {t("to_date")}
          <DateInput
            name="to"
            defaultValue={to}
            locale={locale}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
          />
        </label>
        <button type="submit" className="rounded-lg bg-fleet-teal px-4 py-2 text-sm font-bold text-white">
          {t("report_show")}
        </button>
      </form>

      <ReportActions boatId={boat.id} from={from} to={to} isManagement={profile.role === "management"} locale={locale} />

      <details className="rounded-xl border border-fleet-border bg-white p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-bold text-fleet-navy">
          {t("issued_reports_title", { count: reports?.length ?? 0 })}
        </summary>
        <div className="animate-expand-in mt-3">
          <ReportsManager
            boatId={boat.id}
            reports={reports ?? []}
            reportType="financial"
            issuerNames={issuerNames}
            isManagement={profile.role === "management"}
            locale={locale}
            boatName={boat.name}
            logoUrl={logoUrl}
            categoryLabels={categoryLabels}
            categoryColors={categoryColors}
            paymentLabels={paymentLabels}
          />
        </div>
      </details>

      <FinancialReportDocument
        boatName={boat.name}
        logoUrl={logoUrl}
        from={from}
        to={to}
        generatedOn={today}
        snapshot={snapshot}
        categoryLabels={categoryLabels}
        categoryColors={categoryColors}
        paymentLabels={paymentLabels}
        receiptUrlByPath={receiptUrlByPath}
        locale={locale}
      />
    </div>
  );
}
