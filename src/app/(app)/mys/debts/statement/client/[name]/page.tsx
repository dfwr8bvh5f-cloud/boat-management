import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { getTranslator } from "@/lib/i18n/locale";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { round2 } from "@/lib/money";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";

// The exact same "statement of account" as /mys/debts/statement/[boatId],
// just for a client that isn't a real fleet boat (an ad-hoc/one-off client
// like MOKA, typed straight into mys_ad_hoc_charges.client_name - see
// mys-debts-manager.tsx's own comment on why that page's Statement link
// only ever pointed at a boatId before). The "debt" side here is the
// client's ad-hoc charges (the direct analog of a boat's own bill_to_mys
// expenses), not filtered by invoice_id for the same reason the boat
// version doesn't filter by mys_invoice_id either - this is a complete
// record of what MYS has charged this client, regardless of how it was
// later billed. Payments are matched by client_name, same free-text
// convention every other MYS client picker already uses.
export default async function MysClientStatementPage({ params }: { params: Promise<{ name: string }> }) {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");
  const { t, locale } = await getTranslator();

  const { name: encodedName } = await params;
  const clientName = decodeURIComponent(encodedName);
  if (!clientName) notFound();
  const supabase = await createClient();

  const [{ data: charges }, { data: income }] = await Promise.all([
    supabase.from("mys_ad_hoc_charges").select("id, description, amount, charge_date").eq("client_name", clientName).order("charge_date"),
    supabase.from("mys_income").select("id, description, amount, income_date, notes").eq("client_name", clientName).order("income_date"),
  ]);
  // Not notFound() on an empty charges list - a client with zero ad-hoc
  // charges but at least one payment recorded (or vice versa) is still a
  // real statement worth showing, same as the boat version never requires
  // non-empty expenses either.
  if ((charges ?? []).length === 0 && (income ?? []).length === 0) notFound();

  const totalExpenses = round2((charges ?? []).reduce((s, c) => s + c.amount, 0));
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
            <img src="/mys-logo.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-lg font-bold">Statement of Account</div>
            <div className="text-xs text-fleet-ink">{clientName}</div>
            <div className="text-xs text-fleet-ink">Generated: {formatDateDisplay(todayLocalISO())}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3 rounded-lg bg-fleet-paper p-4 text-center">
          <div>
            <div className="text-2xs font-bold uppercase tracking-wide text-fleet-ink">Total Charges</div>
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
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-fleet-ink">Charges</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-fleet-paper">
                <th className="border-b border-fleet-border px-2 py-2 text-start">Date</th>
                <th className="border-b border-fleet-border px-2 py-2 text-start">Description</th>
                <th className="border-b border-fleet-border px-2 py-2 text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(charges ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-fleet-ink">
                    No charges recorded
                  </td>
                </tr>
              ) : (
                (charges ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 whitespace-nowrap">{formatDateDisplay(c.charge_date)}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5">{c.description}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1.5 text-end">{money(c.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={2} className="px-2 py-2 text-end">
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
