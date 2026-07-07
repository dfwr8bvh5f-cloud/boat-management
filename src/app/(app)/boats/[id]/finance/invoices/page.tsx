import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { getCategoryLabels } from "@/lib/labels";
import { formatDateDisplay } from "@/lib/date-format";
import { PrintButton } from "@/components/print-button";
import { MonthInput } from "@/components/month-input";
import { getTranslator } from "@/lib/i18n/locale";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { boat } = await getBoatContext(id);
  const { month } = await searchParams;
  const selectedMonth = month || new Date().toISOString().slice(0, 7);
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .eq("status", "approved")
    .not("receipt_path", "is", null)
    .gte("expense_date", `${selectedMonth}-01`)
    .lte("expense_date", `${selectedMonth}-31`)
    .is("archived_at", null)
    .order("expense_date");

  const receiptPaths = [...new Set((invoices ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])))];
  const signedUrlByPath = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const withUrls = (invoices ?? []).map((e) => ({
    ...e,
    receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
  }));

  const total = withUrls.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <form method="GET" className="flex items-center gap-2">
          <MonthInput name="month" defaultValue={selectedMonth} locale={locale} />
          <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-2 text-sm font-bold text-white">
            {t("report_show")}
          </button>
        </form>
        <PrintButton locale={locale} />
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-6">
        <h1 className="mb-1 text-lg font-bold text-fleet-navy">{t("invoices_for_month", { month: selectedMonth })}</h1>
        <div className="mb-4 text-sm text-fleet-ink">{t("total")}: €{total.toLocaleString("he-IL")}</div>

        {withUrls.length === 0 ? (
          <p className="text-sm text-fleet-ink">{t("none_invoices")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {withUrls.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-dotted border-fleet-border pb-2">
                {e.receiptUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.receiptUrl} alt="" className="h-10 w-10 rounded object-cover print:hidden" />
                )}
                <div className="flex-1">
                  <div className="text-sm">
                    {e.description}
                    {e.invoice_number ? ` · #${e.invoice_number}` : ""}
                  </div>
                  <div className="text-xs text-fleet-ink">
                    {categoryLabels[e.category]} · <span dir="ltr">{formatDateDisplay(e.expense_date)}</span>
                  </div>
                </div>
                <div className="font-bold text-fleet-navy">€{e.amount.toLocaleString("he-IL")}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
