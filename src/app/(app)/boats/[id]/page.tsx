import Link from "next/link";
import { Wallet, Wrench, Users, Ship, MapPin, Plus, Landmark, Banknote, ClipboardCheck, FileText, Trash2 } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { updateBoat, deleteBoat, uploadBoatLogo, removeBoatLogo } from "@/lib/actions/boats";
import { createIssue } from "@/lib/actions/issues";
import { BoatForm } from "@/components/boat-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AutoSaveForm } from "@/components/autosave-form";
import { SpecsEditToggle } from "@/components/specs-edit-toggle";
import { BoatLogoUpload } from "@/components/boat-logo-upload";
import { QuickExpenseForm } from "@/components/quick-expense-form";
import { getCategoryLabels, getOpStatusLabels } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import { computeBankBalance, computeCashBalance } from "@/lib/balances";

const inputClass =
  "rounded-lg border border-fleet-border bg-[#FAFBFC] px-3 py-2 text-sm text-fleet-navy outline-none focus:border-fleet-brass";

function formatCurrency(n: number) {
  return `€${n.toLocaleString("he-IL")}`;
}

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default async function BoatOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit, profile } = await getBoatContext(id);
  const isOperational = boat.boat_type !== "for_sale";
  const isSubBoat = Boolean(boat.parent_boat_id);
  const showFinanceStaff = isOperational && !isSubBoat;
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const opStatusLabels = getOpStatusLabels(locale);

  const supabase = await createClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [
    { data: budgetRows },
    { data: expensesYTD },
    { data: recentExpenses },
    { data: openIssues },
    { data: recentIssues },
    { count: crewCountRaw },
    bankBalance,
    cashNet,
    { data: expiringDocs },
    { data: staffForPayroll },
    pendingCounts,
    { data: otherBoats },
  ] = await Promise.all([
    showFinanceStaff
      ? supabase.from("budget_categories").select("amount").eq("boat_id", boat.id)
      : Promise.resolve({ data: null }),
    showFinanceStaff
      ? supabase
          .from("expenses")
          .select("amount")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .gte("expense_date", yearStart)
      : Promise.resolve({ data: null }),
    isSubBoat
      ? Promise.resolve({ data: null })
      : supabase
          .from("expenses")
          .select("*")
          .eq("boat_id", boat.id)
          .order("expense_date", { ascending: false })
          .limit(5),
    isOperational
      ? supabase.from("issues").select("id").eq("boat_id", boat.id).not("op_status", "in", "(completed,cancelled)")
      : Promise.resolve({ data: null }),
    isOperational
      ? supabase.from("issues").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: null }),
    showFinanceStaff
      ? supabase.from("staff_visible").select("id", { count: "exact", head: true }).eq("boat_id", boat.id).eq("status", "approved")
      : Promise.resolve({ count: 0 }),
    computeBankBalance(supabase, boat.id),
    computeCashBalance(supabase, boat.id),
    supabase.from("documents").select("id, name, doc_type, expiry_date").eq("boat_id", boat.id).not("expiry_date", "is", null),
    isManagement && showFinanceStaff
      ? supabase.from("staff_visible").select("salary").eq("boat_id", boat.id).eq("status", "approved")
      : Promise.resolve({ data: null }),
    isManagement
      ? Promise.all(
          (["issues", "expenses", "staff", "incomes", "cash_transactions", "bookings", "documents"] as const).map(
            (table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "pending")
          )
        )
      : Promise.resolve(null),
    isManagement
      ? supabase.from("boats").select("id, name").neq("id", boat.id).order("name")
      : Promise.resolve({ data: null }),
  ]);

  const { data: logoUrlData } = boat.logo_path
    ? await supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
    : { data: null };
  const logoUrl = logoUrlData?.signedUrl ?? null;

  const annualBudget = (budgetRows ?? []).reduce((s, b) => s + b.amount, 0);
  const spentYTD = (expensesYTD ?? []).reduce((s, e) => s + e.amount, 0);
  const budgetPct = annualBudget ? Math.min(100, Math.round((spentYTD / annualBudget) * 100)) : 0;
  const openIssuesCount = openIssues?.length ?? 0;
  const crewCount = crewCountRaw ?? 0;

  const docAlerts = (expiringDocs ?? []).filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 30);

  const totalMonthlySalaries = (staffForPayroll ?? []).reduce((s, m) => s + (m.salary ?? 0), 0);
  const payrollShortfall = totalMonthlySalaries - bankBalance;
  const showPayrollWarning =
    isManagement && new Date().getDate() >= 20 && totalMonthlySalaries > 0 && payrollShortfall > 0;

  const pendingCount = pendingCounts ? pendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0) : 0;

  const specs = [
    { label: t("spec_model"), value: boat.model },
    { label: t("spec_year_built"), value: boat.year_built ? String(boat.year_built) : null },
    { label: t("spec_length"), value: boat.length_meters ? `${boat.length_meters}m` : null },
    { label: t("spec_beam"), value: boat.beam_meters ? `${boat.beam_meters}m` : null },
    { label: t("spec_draft"), value: boat.draft_meters ? `${boat.draft_meters}m` : null },
    { label: t("spec_homeport"), value: boat.home_port },
    { label: t("spec_flag"), value: boat.flag },
    { label: t("spec_berth"), value: boat.berth },
    { label: t("spec_registration_number"), value: boat.registration_number },
    { label: "MMSI", value: boat.mmsi },
  ].filter((s) => s.value);

  return (
    <div className="flex flex-col gap-3">
      {isOperational && (
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/boats/${boat.id}/maintenance`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <ClipboardCheck size={13} /> {t("open_issues")}
            </div>
            <div className={`mt-1 text-lg font-bold ${openIssuesCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {openIssuesCount}
            </div>
          </Link>
          <Link
            href={`/boats/${boat.id}/documents`}
            className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <FileText size={13} /> {t("expiring_soon")}
            </div>
            <div className={`mt-1 text-lg font-bold ${docAlerts.length > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {docAlerts.length}
            </div>
          </Link>
        </div>
      )}

      {!isSubBoat && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/boats/${boat.id}/finance/bank`}
            className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm"
          >
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <Landmark size={13} /> {t("bank_balance")}
            </div>
            <div className={`mt-1 text-lg font-bold ${bankBalance < 5000 ? "text-fleet-coral" : "text-fleet-navy"}`}>
              {formatCurrency(bankBalance)}
            </div>
            {bankBalance < 5000 && <div className="mt-0.5 text-[11px] text-fleet-coral">{t("bank_low_balance")}</div>}
          </Link>
          <Link href={`/boats/${boat.id}/finance/cash`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
              <Banknote size={13} /> {t("cash_balance")}
            </div>
            <div className={`mt-1 text-lg font-bold ${cashNet >= 0 ? "text-fleet-moss" : "text-fleet-coral"}`}>
              {formatCurrency(cashNet)}
            </div>
          </Link>
        </div>
      )}

      {canEdit && !isSubBoat && <QuickExpenseForm boatId={boat.id} boatType={boat.boat_type} locale={locale} />}

      {isOperational && canEdit && (
        <details className="group rounded-xl border border-fleet-border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Plus size={16} /> {t("report_issue")}
          </summary>
          <form action={createIssue.bind(null, boat.id)} encType="multipart/form-data" className="mt-4 flex flex-col gap-2.5">
            <input name="title" placeholder={t("issue_title_f")} required className={inputClass} />
            <textarea name="notes" placeholder={t("details")} rows={3} className={inputClass} />
            <input name="photo" type="file" accept="image/*" className="text-xs" />
            <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
              {t("report_issue")}
            </button>
          </form>
        </details>
      )}

      {(specs.length > 0 || isManagement) && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Ship size={15} className="text-fleet-brass" /> {t("specs_title")}
            </div>
            <div className="flex items-center gap-3">
              {boat.mmsi && (
                <a
                  href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${encodeURIComponent(boat.mmsi)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-fleet-brass hover:underline"
                >
                  <MapPin size={13} /> {t("boat_open_full_map")}
                </a>
              )}
              {isManagement && (
                <SpecsEditToggle locale={locale}>
                  <div className="flex flex-wrap items-start gap-3 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3">
                    <BoatLogoUpload
                      logoUrl={logoUrl}
                      onUpload={uploadBoatLogo.bind(null, boat.id)}
                      onRemove={removeBoatLogo.bind(null, boat.id)}
                      locale={locale}
                    />
                  </div>
                  <AutoSaveForm action={updateBoat.bind(null, boat.id)} locale={locale} className="flex flex-col gap-6">
                    <BoatForm boat={boat} otherBoats={otherBoats ?? undefined} />
                  </AutoSaveForm>
                </SpecsEditToggle>
              )}
            </div>
          </div>
          {specs.length > 0 ? (
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {specs.map((s) => (
                <div key={s.label}>
                  <dt className="text-[11px] text-fleet-ink">{s.label}</dt>
                  <dd className="font-medium text-fleet-navy">{s.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2.5 text-sm text-fleet-ink">{t("specs_none_yet")}</p>
          )}
          {boat.mmsi && (
            <div className="mt-3 overflow-hidden rounded-lg border border-fleet-border">
              <iframe
                title={t("boat_live_location")}
                src={`https://www.marinetraffic.com/en/ais/embed/zoom:10/centery:/centerx:/maptype:0/shownames:false/mmsi:${encodeURIComponent(boat.mmsi)}/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:false/remember:false`}
                className="h-[520px] w-full border-0"
                loading="lazy"
              />
            </div>
          )}
        </div>
      )}

      {showFinanceStaff && crewCount > 0 && (
        <Link
          href={`/boats/${boat.id}/staff`}
          className="flex items-center gap-2.5 rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm"
        >
          <Users size={16} className="text-fleet-brass" />
          <div className="text-sm font-bold text-fleet-navy">{crewCount} {t("crew_aboard")}</div>
        </Link>
      )}

      {isManagement && pendingCount > 0 && (
        <Link
          href="/approvals"
          className="flex items-center gap-2.5 rounded-xl border border-fleet-brass bg-[#EEF2F6] p-4 hover:shadow-sm"
        >
          <ClipboardCheck size={18} className="text-fleet-brass" />
          <div className="flex-1">
            <div className="text-sm font-bold text-fleet-navy">{pendingCount} {t("pending_banner")}</div>
            <div className="text-xs text-fleet-ink">{t("pending_cta")}</div>
          </div>
        </Link>
      )}

      {showPayrollWarning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-fleet-coral bg-fleet-coral/10 p-4">
          <Wallet size={17} className="text-fleet-coral" />
          <div>
            <div className="text-sm font-bold text-fleet-coral">{t("payroll_warning_title")}</div>
            <div className="mt-0.5 text-xs text-fleet-ink">
              {t("payroll_warning_body", { amount: formatCurrency(payrollShortfall) })}
            </div>
          </div>
        </div>
      )}

      {showFinanceStaff && (
        <Link href={`/boats/${boat.id}/finance/budget`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
          <div className="text-xs text-fleet-ink">{t("exp_ytd")}</div>
          <div className="text-lg font-bold text-fleet-navy">{formatCurrency(spentYTD)}</div>
          {annualBudget > 0 && (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fleet-border">
                <div
                  className="h-full"
                  style={{
                    width: `${budgetPct}%`,
                    backgroundColor: budgetPct <= 30 ? "#8FD9A8" : budgetPct <= 70 ? "#F5D77C" : "#F0938A",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px] text-fleet-ink">
                {budgetPct}% {t("budget_used_pct")} · {t("of_budget")} {formatCurrency(annualBudget)} {t("budget_word_annual")}
              </div>
            </>
          )}
        </Link>
      )}

      {!isSubBoat && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Wallet size={15} className="text-fleet-brass" /> {t("recent_expenses")}
            </div>
            <Link href={`/boats/${boat.id}/finance`} className="text-xs font-medium text-fleet-brass hover:underline">
              {t("show_all")}
            </Link>
          </div>
          {!recentExpenses || recentExpenses.length === 0 ? (
            <p className="py-3 text-center text-sm text-fleet-ink">{t("none_expenses")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                  <span className="min-w-0 flex-1 truncate text-fleet-navy">{e.description}</span>
                  <span className="shrink-0 text-xs text-fleet-ink">{categoryLabels[e.category]}</span>
                  <span className="shrink-0 font-medium text-fleet-navy">{formatCurrency(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isOperational && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Wrench size={15} className="text-fleet-brass" /> {t("recent_issues")}
            </div>
            <Link href={`/boats/${boat.id}/maintenance`} className="text-xs font-medium text-fleet-brass hover:underline">
              {t("show_all")}
            </Link>
          </div>
          {!recentIssues || recentIssues.length === 0 ? (
            <p className="py-3 text-center text-sm text-fleet-ink">{t("no_issues")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentIssues.map((i) => (
                <div key={i.id} className="flex items-center justify-between border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                  <span className="text-fleet-navy">{i.title}</span>
                  <span className="text-xs text-fleet-ink">{opStatusLabels[i.op_status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {profile.role === "management" && (
        <div className="flex justify-end">
          <form action={deleteBoat.bind(null, boat.id)}>
            <ConfirmSubmitButton
              confirmMessage={t("delete_boat_confirm")}
              ariaLabel={t("delete_boat_button")}
              className="flex items-center gap-1 rounded-lg p-2 text-fleet-ink hover:text-fleet-coral"
            >
              <Trash2 size={16} />
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
