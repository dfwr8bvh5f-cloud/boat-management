import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCategoryLabels } from "@/lib/labels";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";

// A printable "statement of account" for one boat's relationship with MYS -
// every real expense recorded against it (any payment source, not just
// ones MYS fronted - see her explicit call on scope) on one side, every
// payment she's recorded toward it on the other, with a running balance.
// Same fixed-English business-document convention as the generated invoice
// (src/app/(app)/mys/invoices/[id]/page.tsx) regardless of the viewer's own
// locale - this is meant to be sent to the boat's owner, not read as app
// chrome. Income is matched by client_name = the boat's own name, the same
// free-text link every other MYS client picker already uses (see
// mys/income/page.tsx's combined boats+ad-hoc-clients list) - never a
// guessed/fuzzy match, since a fleet boat's income rows are created with
// its exact name as client_name to begin with.
export default async function MysBoatStatementPage({ params }: { params: Promise<{ boatId: string }> }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");
  const { t, locale } = await getTranslator();

  const { boatId } = await params;
  const supabase = await createClient();

  const { data: boat } = await supabase.from("boats").select("id, name, logo_path").eq("id", boatId).single();
  if (!boat) notFound();

  const [{ data: expenses }, { data: income }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, description, category, amount, expense_date")
      .eq("boat_id", boatId)
      .eq("status", "approved")
      .eq("is_payment_plan", false)
      .order("expense_date"),
    supabase.from("mys_income").select("id, description, amount, income_date, notes").eq("client_name", boat.name).order("income_date"),
  ]);

  const categoryLabels = getCategoryLabels("en");
  const logoUrl = boat.logo_path ? supabase.storage.from("boat-photos").getPublicUrl(boat.logo_path).data.publicUrl : "/mys-logo.png";

  const totalExpenses = round2((expenses ?? []).reduce((s, e) => s + e.amount, 0));
  const totalPaid = round2((income ?? []).reduce((s, i) => s + i.amount, 0));
  const balance = round2(totalExpenses - totalPaid);

  const money = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/mys/debts" className="text-sm font-medium text-fleet-teal hover:underline">
          ← {t("back_to_mys")}
        </Link>
        <PrintButton locale={locale} />
      </div>

      <div dir="ltr" className="rounded-xl border border-fleet-border bg-white p-6 text-sm text-fleet-navy sm:p-10 print:border-0 print:p-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-lg font-bold">Statement of Account</div>
            <div className="text-xs text-fleet-ink">{boat.name}</div>
            <div className="text-xs text-fleet-ink">Generated: {formatDateDisplay(todayLocalISO())}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-fleet-paper p-4 text-center">
          <div>
            <div className="text-2xs font-bold uppercase tracking-wide text-fleet-ink">Total Expenses</div>
            <div className="text-lg font-bold">{money(totalExpenses)}</div>
          </div>
          <div>
            <div className="text-2xs font-bold uppercase tracking-wide text-fleet-ink">Total Received</div>
            <div className="text-lg font-bold text-fleet-moss-text">{money(totalPaid)}</div>
          </div>
          <div>
            <div className="text-2xs font-bold uppercase tracking-wide text-fleet-ink">{balance >= 0 ? "Balance Due" : "Credit Balance"}</div>
            <div className={`text-lg font-bold ${balance > 0 ? "text-fleet-coral-text" : "text-fleet-moss-text"}`}>{money(Math.abs(balance))}</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-fleet-ink">Expenses</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-fleet-paper">
                <th className="border-b border-fleet-border px-2 py-2 text-start">Date</th>
                <th className="border-b border-fleet-border px-2 py-2 text-start">Description</th>
                <th className="border-b border-fleet-border px-2 py-2 text-start">Category</th>
                <th className="border-b border-fleet-border px-2 py-2 text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(expenses ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-3 text-center text-fleet-ink">
                    No expenses recorded
                  </td>
                </tr>
              ) : (
                (expenses ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 whitespace-nowrap">{formatDateDisplay(e.expense_date)}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5">{e.description}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5">{e.category ? categoryLabels[e.category] : "—"}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 text-end">{money(e.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={3} className="px-2 py-2 text-end">
                  Total
                </td>
                <td className="px-2 py-2 text-end">{money(totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-fleet-ink">Payments Received</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-fleet-paper">
                <th className="border-b border-fleet-border px-2 py-2 text-start">Date</th>
                <th className="border-b border-fleet-border px-2 py-2 text-start">Description</th>
                <th className="border-b border-fleet-border px-2 py-2 text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(income ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-fleet-ink">
                    No payments recorded
                  </td>
                </tr>
              ) : (
                (income ?? []).map((i) => (
                  <tr key={i.id}>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 whitespace-nowrap">{formatDateDisplay(i.income_date)}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5">
                      {i.description}
                      {i.notes ? ` — ${i.notes}` : ""}
                    </td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 text-end">{money(i.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={2} className="px-2 py-2 text-end">
                  Total
                </td>
                <td className="px-2 py-2 text-end">{money(totalPaid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
