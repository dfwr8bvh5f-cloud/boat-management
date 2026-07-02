import Link from "next/link";
import { Wallet, Wrench, Users, Ship, MapPin, Plus, Landmark, Banknote, ClipboardCheck, FileText } from "lucide-react";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { updateBoat, deleteBoat, uploadBoatLogo, uploadBoatImage } from "@/lib/actions/boats";
import { createExpense } from "@/lib/actions/expenses";
import { createIssue } from "@/lib/actions/issues";
import { BoatForm } from "@/components/boat-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { AutoSaveForm } from "@/components/autosave-form";
import { SpecsEditToggle } from "@/components/specs-edit-toggle";
import {
  CATEGORY_LABELS,
  OP_STATUS_LABELS,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_LABELS,
  PAID_BY_LABELS,
  isCashInflow,
} from "@/lib/labels";

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
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: budgetRows },
    { data: expensesYTD },
    { data: recentExpenses },
    { data: openIssues },
    { data: recentIssues },
    { count: crewCountRaw },
    { data: bank },
    { data: cashTx },
    { data: expiringDocs },
    { data: staffForPayroll },
    pendingCounts,
    { data: otherBoats },
  ] = await Promise.all([
    isOperational
      ? supabase.from("budget_categories").select("amount").eq("boat_id", boat.id)
      : Promise.resolve({ data: null }),
    isOperational
      ? supabase
          .from("expenses")
          .select("amount")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .gte("expense_date", yearStart)
      : Promise.resolve({ data: null }),
    supabase
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
    isOperational
      ? supabase.from("staff_visible").select("id", { count: "exact", head: true }).eq("boat_id", boat.id).eq("status", "approved")
      : Promise.resolve({ count: 0 }),
    supabase.from("bank_balances").select("balance").eq("boat_id", boat.id).maybeSingle(),
    supabase.from("cash_transactions").select("type, amount").eq("boat_id", boat.id),
    supabase.from("documents").select("id, name, doc_type, expiry_date").eq("boat_id", boat.id).not("expiry_date", "is", null),
    isManagement
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

  const [{ data: logoUrlData }, { data: imageUrlData }] = await Promise.all([
    boat.logo_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.logo_path, 3600)
      : Promise.resolve({ data: null }),
    boat.image_path
      ? supabase.storage.from("boat-photos").createSignedUrl(boat.image_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const logoUrl = logoUrlData?.signedUrl ?? null;
  const imageUrl = imageUrlData?.signedUrl ?? null;

  const annualBudget = (budgetRows ?? []).reduce((s, b) => s + b.amount, 0);
  const spentYTD = (expensesYTD ?? []).reduce((s, e) => s + e.amount, 0);
  const budgetPct = annualBudget ? Math.min(100, Math.round((spentYTD / annualBudget) * 100)) : 0;
  const openIssuesCount = openIssues?.length ?? 0;
  const crewCount = crewCountRaw ?? 0;

  const bankBalance = bank?.balance ?? 0;
  const cashInflow = (cashTx ?? []).filter((c) => isCashInflow(c.type)).reduce((s, c) => s + c.amount, 0);
  const cashUsage = (cashTx ?? []).filter((c) => c.type === "usage").reduce((s, c) => s + c.amount, 0);
  const cashNet = cashInflow - cashUsage;

  const docAlerts = (expiringDocs ?? []).filter((d) => d.expiry_date && daysUntil(d.expiry_date) <= 30);

  const totalMonthlySalaries = (staffForPayroll ?? []).reduce((s, m) => s + (m.salary ?? 0), 0);
  const payrollShortfall = totalMonthlySalaries - bankBalance;
  const showPayrollWarning =
    isManagement && new Date().getDate() >= 20 && totalMonthlySalaries > 0 && payrollShortfall > 0;

  const pendingCount = pendingCounts ? pendingCounts.reduce((sum, c) => sum + (c.count ?? 0), 0) : 0;

  const specs = [
    { label: "דגם", value: boat.model },
    { label: "שנת ייצור", value: boat.year_built ? String(boat.year_built) : null },
    { label: "אורך", value: boat.length_meters ? `${boat.length_meters}m` : null },
    { label: "רוחב", value: boat.beam_meters ? `${boat.beam_meters}m` : null },
    { label: "שוקע", value: boat.draft_meters ? `${boat.draft_meters}m` : null },
    { label: "נמל בית", value: boat.home_port },
    { label: "דגל", value: boat.flag },
    { label: "מקום עגינה", value: boat.berth },
    { label: "מספר רישוי", value: boat.registration_number },
    { label: "MMSI", value: boat.mmsi },
  ].filter((s) => s.value);

  return (
    <div className="flex flex-col gap-6">
      {imageUrl && (
        <div className="overflow-hidden rounded-xl border border-fleet-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={boat.name} className="h-48 w-full object-cover sm:h-64" />
        </div>
      )}

      {canEdit && (
        <details className="group rounded-xl border border-fleet-border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Plus size={16} /> הוספת הוצאה
          </summary>
          <form action={createExpense.bind(null, boat.id)} encType="multipart/form-data" className="mt-4 flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2">
              <input name="description" placeholder="תיאור" required className={`${inputClass} col-span-2`} />
              <input name="amount" type="number" step="0.01" required placeholder="סכום (€)" className={inputClass} />
            </div>
            <select name="category" defaultValue="other" className={inputClass}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input name="expense_date" type="date" defaultValue={today} className={inputClass} />
              <select name="payment_method" defaultValue="other" className={inputClass}>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <select name="paid_by" defaultValue="crew" className={inputClass}>
              <option value="crew">{PAID_BY_LABELS.crew}</option>
              <option value="management">{PAID_BY_LABELS.management}</option>
            </select>
            <textarea name="notes" placeholder="הערות" rows={2} className={inputClass} />
            <input name="receipt" type="file" accept="image/*" className="text-xs" />
            <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
              הוסף הוצאה
            </button>
          </form>
        </details>
      )}

      {isOperational && canEdit && (
        <details className="group rounded-xl border border-fleet-border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Plus size={16} /> דווח תקלה
          </summary>
          <form action={createIssue.bind(null, boat.id)} encType="multipart/form-data" className="mt-4 flex flex-col gap-2.5">
            <input name="title" placeholder="כותרת התקלה" required className={inputClass} />
            <textarea name="notes" placeholder="פרטים" rows={3} className={inputClass} />
            <input name="photo" type="file" accept="image/*" className="text-xs" />
            <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
              דווח תקלה
            </button>
          </form>
        </details>
      )}

      {(specs.length > 0 || canEdit) && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Ship size={15} className="text-fleet-brass" /> מפרט הסירה
            </div>
            <div className="flex items-center gap-3">
              {boat.mmsi && (
                <a
                  href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${encodeURIComponent(boat.mmsi)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-fleet-brass hover:underline"
                >
                  <MapPin size={13} /> מיקום חי (AIS)
                </a>
              )}
              {canEdit && (
                <SpecsEditToggle>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <AutoSaveForm
                      action={uploadBoatLogo.bind(null, boat.id)}
                      debounceMs={0}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3"
                    >
                      {logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain" />
                      )}
                      <span className="text-xs font-bold text-fleet-navy">לוגו הסירה</span>
                      <input name="logo" type="file" accept="image/*" className="min-w-0 flex-1 text-xs" />
                    </AutoSaveForm>
                    <AutoSaveForm
                      action={uploadBoatImage.bind(null, boat.id)}
                      debounceMs={0}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper p-3"
                    >
                      <span className="text-xs font-bold text-fleet-navy">תמונת הסירה</span>
                      <input name="image" type="file" accept="image/*" className="min-w-0 flex-1 text-xs" />
                    </AutoSaveForm>
                  </div>
                  <AutoSaveForm action={updateBoat.bind(null, boat.id)} className="flex flex-col gap-6">
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
            <p className="mt-2.5 text-sm text-fleet-ink">עדיין לא הוזנו פרטים — לחצי על הסרגל להוספה.</p>
          )}
        </div>
      )}

      {isOperational && crewCount > 0 && (
        <Link
          href={`/boats/${boat.id}/staff`}
          className="flex items-center gap-2.5 rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm"
        >
          <Users size={16} className="text-fleet-brass" />
          <div className="text-sm font-bold text-fleet-navy">{crewCount} אנשי צוות על הסירה</div>
        </Link>
      )}

      {isManagement && pendingCount > 0 && (
        <Link
          href="/approvals"
          className="flex items-center gap-2.5 rounded-xl border border-fleet-brass bg-[#EEF2F6] p-4 hover:shadow-sm"
        >
          <ClipboardCheck size={18} className="text-fleet-brass" />
          <div className="flex-1">
            <div className="text-sm font-bold text-fleet-navy">{pendingCount} ממתינים לאישור בצי</div>
            <div className="text-xs text-fleet-ink">לחץ לבדיקה ואישור</div>
          </div>
        </Link>
      )}

      {docAlerts.length > 0 && (
        <Link
          href={`/boats/${boat.id}/documents`}
          className="flex items-center gap-2.5 rounded-xl border border-fleet-coral bg-fleet-coral/10 p-4 hover:shadow-sm"
        >
          <FileText size={18} className="text-fleet-coral" />
          <div className="text-sm font-bold text-fleet-navy">{docAlerts.length} מסמכים פגי תוקף בקרוב</div>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={`/boats/${boat.id}/finance/bank`}
          className={`rounded-xl p-4 text-white hover:opacity-95 ${bankBalance < 5000 ? "bg-fleet-coral" : "bg-fleet-navy"}`}
        >
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <Landmark size={13} /> מצב חשבון
          </div>
          <div className="mt-1 text-lg font-bold">{formatCurrency(bankBalance)}</div>
          {bankBalance < 5000 && <div className="mt-0.5 text-[11px] opacity-90">יתרה נמוכה</div>}
        </Link>
        <Link href={`/boats/${boat.id}/finance/cash`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-fleet-ink">
            <Banknote size={13} /> מזומן בקופה
          </div>
          <div className={`mt-1 text-lg font-bold ${cashNet >= 0 ? "text-fleet-moss" : "text-fleet-coral"}`}>
            {formatCurrency(cashNet)}
          </div>
        </Link>
      </div>

      {showPayrollWarning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-fleet-coral bg-fleet-coral/10 p-4">
          <Wallet size={17} className="text-fleet-coral" />
          <div>
            <div className="text-sm font-bold text-fleet-coral">בדקי שיש מספיק כסף למשכורות</div>
            <div className="mt-0.5 text-xs text-fleet-ink">
              יתרת הבנק נמוכה מסך המשכורות החודשיות ב-{formatCurrency(payrollShortfall)}.
            </div>
          </div>
        </div>
      )}

      {isOperational && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href={`/boats/${boat.id}/finance/budget`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
            <div className="text-xs text-fleet-ink">הוצאות השנה</div>
            <div className="text-lg font-bold text-fleet-navy">{formatCurrency(spentYTD)}</div>
            {annualBudget > 0 && (
              <>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fleet-border">
                  <div
                    className={`h-full ${budgetPct <= 70 ? "bg-fleet-moss" : "bg-fleet-coral"}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-fleet-ink">מתוך {formatCurrency(annualBudget)} תקציב שנתי</div>
              </>
            )}
          </Link>
          <Link href={`/boats/${boat.id}/maintenance`} className="rounded-xl border border-fleet-border bg-white p-4 hover:shadow-sm">
            <div className="text-xs text-fleet-ink">תקלות פתוחות</div>
            <div className={`text-lg font-bold ${openIssuesCount > 0 ? "text-fleet-coral" : "text-fleet-moss"}`}>
              {openIssuesCount}
            </div>
            <div className="mt-1 text-[11px] text-fleet-ink">{openIssuesCount > 0 ? "דורש טיפול" : "אין תקלות פתוחות"}</div>
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
            <Wallet size={15} className="text-fleet-brass" /> הוצאות אחרונות
          </div>
          <Link href={`/boats/${boat.id}/finance`} className="text-xs font-medium text-fleet-brass hover:underline">
            הצג הכל
          </Link>
        </div>
        {!recentExpenses || recentExpenses.length === 0 ? (
          <p className="py-3 text-center text-sm text-fleet-ink">עדיין אין הוצאות רשומות.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recentExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate text-fleet-navy">{e.description}</span>
                <span className="shrink-0 text-xs text-fleet-ink">{CATEGORY_LABELS[e.category]}</span>
                <span className="shrink-0 font-medium text-fleet-navy">{formatCurrency(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOperational && (
        <div className="rounded-xl border border-fleet-border bg-white p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">
              <Wrench size={15} className="text-fleet-brass" /> תקלות אחרונות
            </div>
            <Link href={`/boats/${boat.id}/maintenance`} className="text-xs font-medium text-fleet-brass hover:underline">
              הצג הכל
            </Link>
          </div>
          {!recentIssues || recentIssues.length === 0 ? (
            <p className="py-3 text-center text-sm text-fleet-ink">אין תקלות רשומות.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentIssues.map((i) => (
                <div key={i.id} className="flex items-center justify-between border-b border-dotted border-fleet-border py-1.5 text-sm last:border-0">
                  <span className="text-fleet-navy">{i.title}</span>
                  <span className="text-xs text-fleet-ink">{OP_STATUS_LABELS[i.op_status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {profile.role === "management" && (
        <div className="flex items-center justify-between rounded-xl border border-fleet-coral/40 bg-fleet-coral/10 p-4">
          <div>
            <h2 className="text-sm font-bold text-fleet-coral">מחיקת סירה</h2>
            <p className="text-xs text-fleet-coral/80">פעולה זו תמחק לצמיתות את הסירה ואת כל הנתונים המקושרים אליה.</p>
          </div>
          <form action={deleteBoat.bind(null, boat.id)}>
            <ConfirmSubmitButton
              confirmMessage="למחוק את הסירה לצמיתות? הפעולה בלתי הפיכה."
              className="rounded-lg border border-fleet-coral/50 bg-white px-4 py-2 text-xs font-bold text-fleet-coral hover:bg-fleet-coral/10"
            >
              מחק סירה
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
