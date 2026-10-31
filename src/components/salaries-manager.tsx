"use client";

import { useMemo, useState } from "react";
import { useRefreshTransition } from "@/lib/hooks/use-refresh-transition";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark, Minus, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  createMysStaff,
  setStaffStartDate,
  setMysStaffStartDate,
  upsertSalaryPeriod,
  markSalaryPeriodPaid,
  unmarkSalaryPeriodPaid,
  createStaffLoan,
  deleteStaffLoan,
  addLoanRepayment,
  deleteLoanRepayment,
  deleteMysStaff,
} from "@/lib/actions/salaries";
import { createStaff, deleteStaff } from "@/lib/actions/staff";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CollapsibleField } from "@/components/collapsible-field";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysStaff, SalaryPeriod, Staff, StaffLoan, StaffLoanRepayment } from "@/lib/types/database";
import { formatCurrency, formatCurrencySigned, round2 } from "@/lib/money";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { FORM_CARD_CLASS, INPUT_CLASS, INPUT_CLASS_COMPACT } from "@/lib/ui-classes";

type PersonRef = { staffId: string; mysStaffId?: undefined } | { staffId?: undefined; mysStaffId: string };

function refFor(person: { id: string }, kind: "staff" | "mys"): PersonRef {
  return kind === "staff" ? { staffId: person.id } : { mysStaffId: person.id };
}

function daysInMonth(periodMonth: string): number {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function shiftMonth(periodMonth: string, delta: number): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(periodMonth: string, locale: Locale): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  const tag = locale === "he" ? "he-IL" : locale === "el" ? "el-GR" : "en-US";
  return date.toLocaleDateString(tag, { month: "long", year: "numeric", timeZone: "UTC" });
}

// The loan this person is currently paying off, if any - oldest loan first
// (first taken, first cleared), skipping any already fully repaid. Mirrors
// findActiveLoanId in lib/actions/salaries.ts so the prefilled repayment
// box and warning icon here never disagree with what marking paid actually
// deducts from.
function activeLoanFor(loans: StaffLoan[], repayments: StaffLoanRepayment[]): { loan: StaffLoan; outstanding: number } | null {
  const sorted = [...loans].sort((a, b) => a.loan_date.localeCompare(b.loan_date));
  for (const loan of sorted) {
    const repaid = round2(repayments.filter((r) => r.loan_id === loan.id).reduce((s, r) => s + r.amount, 0));
    const outstanding = round2(loan.amount - repaid);
    if (outstanding > 0) return { loan, outstanding };
  }
  return null;
}

export function SalariesManager({
  locale,
  periodMonth,
  staff,
  mysStaff,
  boats,
  periods,
  loans,
  repayments,
  leftStaffIds,
  leftMysStaffIds,
}: {
  locale: Locale;
  periodMonth: string;
  staff: Staff[];
  mysStaff: MysStaff[];
  boats: { id: string; name: string }[];
  periods: SalaryPeriod[];
  loans: StaffLoan[];
  repayments: StaffLoanRepayment[];
  leftStaffIds: string[];
  leftMysStaffIds: string[];
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const boatNameById = useMemo(() => new Map(boats.map((b) => [b.id, b.name])), [boats]);
  const periodByStaffId = useMemo(() => new Map(periods.filter((p) => p.staff_id).map((p) => [p.staff_id as string, p])), [periods]);
  const periodByMysStaffId = useMemo(
    () => new Map(periods.filter((p) => p.mys_staff_id).map((p) => [p.mys_staff_id as string, p])),
    [periods]
  );

  // Shown for the month if still active today and they haven't already left
  // in some earlier month (leftStaffIds/leftMysStaffIds - see page.tsx),
  // or if there's already a (historical) period row for this specific
  // month - so an existing record for this exact month is never hidden,
  // and deactivating someone after they were paid never hides what already
  // happened. Also dropped entirely if their boat isn't in the `boats`
  // list at all (the page already excludes inactive/demo boats there) - a
  // crew member of a boat that's out of the fleet has no payroll
  // obligation here.
  const boatIds = useMemo(() => new Set(boats.map((b) => b.id)), [boats]);
  const leftStaffIdSet = useMemo(() => new Set(leftStaffIds), [leftStaffIds]);
  const leftMysStaffIdSet = useMemo(() => new Set(leftMysStaffIds), [leftMysStaffIds]);
  const visibleStaff = staff
    .filter(
      (m) => boatIds.has(m.boat_id) && (periodByStaffId.has(m.id) || (m.active && !leftStaffIdSet.has(m.id)))
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleMysStaff = mysStaff
    .filter((m) => periodByMysStaffId.has(m.id) || (m.active && !leftMysStaffIdSet.has(m.id)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const staffByBoat = useMemo(() => {
    const map = new Map<string, Staff[]>();
    for (const m of visibleStaff) {
      (map.get(m.boat_id) ?? map.set(m.boat_id, []).get(m.boat_id)!).push(m);
    }
    return map;
  }, [visibleStaff]);
  // Fixed order (alphabetical by boat name), not the Map's insertion order
  // (which depended on which boat's crew member sorted first alphabetically
  // by name) - that made the boat groups visibly reorder themselves as crew
  // were added/edited.
  const sortedBoats = useMemo(() => [...boats].sort((a, b) => a.name.localeCompare(b.name)), [boats]);

  const [showAddStaff, setShowAddStaff] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("salaries_title")}</h1>
        <div className="flex items-center gap-1">
          <Link
            href={`/mys/salaries?month=${shiftMonth(periodMonth, -1).slice(0, 7)}`}
            aria-label={t("salaries_previous_month")}
            title={t("salaries_previous_month")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-fleet-border text-fleet-navy hover:bg-fleet-paper"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </Link>
          <span dir="ltr" className="min-w-[9rem] text-center text-sm font-bold text-fleet-navy">
            {monthLabel(periodMonth, locale)}
          </span>
          <Link
            href={`/mys/salaries?month=${shiftMonth(periodMonth, 1).slice(0, 7)}`}
            aria-label={t("salaries_next_month")}
            title={t("salaries_next_month")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-fleet-border text-fleet-navy hover:bg-fleet-paper"
          >
            <ChevronRight size={16} className="rtl:rotate-180" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Button type="button" size="compact" onClick={() => setShowAddStaff((s) => !s)}>
          {showAddStaff ? <X size={14} /> : <Plus size={14} />}
          {showAddStaff ? t("close_word") : t("salaries_add_staff_button")}
        </Button>
        {showAddStaff && <AddStaffForm locale={locale} boats={boats} onDone={() => setShowAddStaff(false)} />}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-fleet-navy">
          <Users size={16} /> {t("salaries_crew_section_title")}
        </h2>
        {visibleStaff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-5 text-center text-sm text-fleet-ink">
            {t("salaries_no_crew")}
          </p>
        ) : (
          sortedBoats
            .filter((b) => staffByBoat.has(b.id))
            .map((b) => (
              <div key={b.id} className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-fleet-ink">{boatNameById.get(b.id) ?? ""}</div>
                {staffByBoat.get(b.id)!.map((m) => (
                  <SalaryRow
                    key={m.id}
                    locale={locale}
                    periodMonth={periodMonth}
                    personRef={refFor(m, "staff")}
                    name={m.name}
                    subtitle={m.position}
                    baseSalary={m.salary}
                    startDate={m.start_date}
                    period={periodByStaffId.get(m.id) ?? null}
                    loans={loans.filter((l) => l.staff_id === m.id)}
                    repayments={repayments}
                    onDelete={deleteStaff.bind(null, m.boat_id, m.id, m.photo_path, m.resume_path, m.id_document_path)}
                  />
                ))}
              </div>
            ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-fleet-navy">
          <Landmark size={16} /> {t("salaries_office_section_title")}
        </h2>

        {visibleMysStaff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-5 text-center text-sm text-fleet-ink">
            {t("salaries_no_office_staff")}
          </p>
        ) : (
          visibleMysStaff.map((m) => (
            <SalaryRow
              key={m.id}
              locale={locale}
              periodMonth={periodMonth}
              personRef={refFor(m, "mys")}
              name={m.name}
              subtitle={m.position}
              baseSalary={m.salary}
              startDate={m.start_date}
              period={periodByMysStaffId.get(m.id) ?? null}
              loans={loans.filter((l) => l.mys_staff_id === m.id)}
              repayments={repayments}
              onDelete={deleteMysStaff.bind(null, m.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

// One general "add employee" entry point instead of a separate button per
// section - who it's added as (boat crew vs. MYS office) is just the first
// field, a destination picker, rather than two different buttons/forms.
const MYS_DESTINATION = "mys";

function AddStaffForm({
  locale,
  boats,
  onDone,
}: {
  locale: Locale;
  boats: { id: string; name: string }[];
  onDone: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { startTransition, router } = useRefreshTransition();
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        if (!destination) {
          setError(t("salaries_select_destination_error"));
          return;
        }
        setSaving(true);
        setError(null);
        try {
          if (destination === MYS_DESTINATION) await createMysStaff(formData);
          else await createStaff(destination, formData);
          startTransition(() => {
            router.refresh();
            setSaving(false);
          });
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("save_failed"));
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <CustomSelect
        value={destination}
        onChange={setDestination}
        options={[
          { value: MYS_DESTINATION, label: t("salaries_office_section_title") },
          ...boats.map((b) => ({ value: b.id, label: b.name })),
        ]}
        placeholder={t("salaries_select_destination_placeholder")}
        emphasizeEmpty
        required
        locale={locale}
        className={INPUT_CLASS}
      />
      <div className="grid grid-cols-2 gap-3">
        <input name="name" required placeholder={`${t("name_word")} *`} className={INPUT_CLASS} />
        <input name="position" placeholder={t("position_field")} className={INPUT_CLASS} />
      </div>
      <input
        name="salary"
        type="number"
        step="0.01"
        placeholder={t("salaries_base_salary_field")}
        onWheel={(e) => e.currentTarget.blur()}
        className={INPUT_CLASS}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          {t("close_word")}
        </Button>
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : (
            t("save_word")
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
    </form>
  );
}

function SalaryRow({
  locale,
  periodMonth,
  personRef,
  name,
  subtitle,
  baseSalary,
  startDate,
  period,
  loans,
  repayments,
  onDelete,
}: {
  locale: Locale;
  periodMonth: string;
  personRef: PersonRef;
  name: string;
  subtitle: string | null;
  baseSalary: number | null;
  startDate: string | null;
  period: SalaryPeriod | null;
  loans: StaffLoan[];
  repayments: StaffLoanRepayment[];
  onDelete: () => Promise<void>;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const base = baseSalary ?? 0;
  const paid = period?.paid ?? false;
  const isSplit = Boolean(period && (period.cash_amount ?? 0) > 0 && (period.bank_amount ?? 0) > 0);
  const activeLoan = activeLoanFor(loans, repayments);
  const [editing, setEditing] = useState(false);
  const [showLoans, setShowLoans] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the compact line shows - the saved period's own total once one
  // exists, falling back to the plain base salary as a preview for a
  // month that was never opened/saved yet.
  const savedTotal = period
    ? round2((period.full_month ? period.base_amount : (period.prorated_amount ?? 0)) + (period.bonus_amount ?? 0))
    : base;

  if (editing) {
    return (
      <SalaryEditForm
        locale={locale}
        periodMonth={periodMonth}
        personRef={personRef}
        name={name}
        subtitle={subtitle}
        baseSalary={base}
        startDate={startDate}
        period={period}
        loans={loans}
        repayments={repayments}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-white px-3 py-1.5 text-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fleet-navy">
            {name}
            {subtitle && <span className="text-fleet-ink"> · {subtitle}</span>}
          </div>
          {!paid && (
            <div className="truncate text-2xs text-fleet-ink">
              {t("salaries_due_date_label")}: <span dir="ltr">{formatDateDisplay(shiftMonth(periodMonth, 1))}</span>
            </div>
          )}
          {/* A period that wasn't paid in full - a partial month, an extra,
              or a deduction - says so right here, not only once the edit
              form is opened. */}
          {period && (!period.full_month || (period.bonus_amount ?? 0) !== 0) && (
            <div className="truncate text-2xs text-fleet-ink">
              {!period.full_month && t("salaries_partial_period_label")}
              {!period.full_month && (period.bonus_amount ?? 0) !== 0 && "  ·  "}
              {(period.bonus_amount ?? 0) !== 0 && (
                <span className={period.bonus_amount! < 0 ? "text-fleet-coral-text" : undefined}>
                  {period.bonus_amount! > 0 ? t("salaries_extra_label") : t("salaries_deduction_label")}:{" "}
                  {period.bonus_amount! > 0 ? `+${formatCurrency(period.bonus_amount!)}` : formatCurrencySigned(period.bonus_amount!)}
                  {period.bonus_description && ` - ${period.bonus_description}`}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Fixed-width trailing cells (same widths on every row, regardless
            of content) so amounts and actions line up in columns down the
            whole list instead of drifting with each row's own name length
            or split/non-split state. */}
        <div className="flex w-12 shrink-0 justify-end">
          {loans.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLoans((s) => !s)}
              title={activeLoan ? `${t("salaries_loan_outstanding_label")}: ${formatCurrency(activeLoan.outstanding)}` : undefined}
              className={`flex items-center gap-1 whitespace-nowrap text-xs hover:text-fleet-teal ${activeLoan ? "font-bold text-fleet-coral-text" : "text-fleet-ink"}`}
            >
              {activeLoan ? <AlertTriangle size={13} /> : <Landmark size={13} />}
              {activeLoan ? formatCurrency(activeLoan.outstanding) : loans.length}
            </button>
          )}
        </div>
        <div className="flex w-28 shrink-0 flex-col items-end gap-1">
          {isSplit && period ? (
            <>
              <span className="whitespace-nowrap font-bold text-fleet-navy">{formatCurrency(savedTotal)}</span>
              <SplitPaymentToggle
                locale={locale}
                periodId={period.id}
                amount={period.cash_amount!}
                amountLabel={t("salaries_cash_amount_field")}
                paidAt={period.cash_paid_at}
                method="cash"
                setError={setError}
              />
              <SplitPaymentToggle
                locale={locale}
                periodId={period.id}
                amount={period.bank_amount!}
                amountLabel={t("salaries_bank_amount_field")}
                paidAt={period.bank_paid_at}
                method="bank"
                setError={setError}
              />
            </>
          ) : (
            <>
              <span className="whitespace-nowrap font-bold text-fleet-navy">{formatCurrency(savedTotal)}</span>
              <form
                action={async () => {
                  setError(null);
                  try {
                    if (paid && period) {
                      await unmarkSalaryPeriodPaid(period.id);
                      return;
                    }
                    // No saved period row yet (the draft preview synthesized from
                    // base salary) - create it with that same preview's figures
                    // before marking it paid, so the pill works immediately
                    // instead of silently doing nothing until she opens the edit
                    // form and saves first.
                    let periodId = period?.id;
                    if (!periodId) {
                      const formData = new FormData();
                      formData.set("base_amount", String(base));
                      const upsertResult = await upsertSalaryPeriod(personRef, periodMonth, formData);
                      periodId = upsertResult.id;
                    }
                    const result = await markSalaryPeriodPaid(periodId);
                    if (result?.error) setError(result.error);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : t("save_failed"));
                  }
                }}
              >
                <ConfirmSubmitButton
                  locale={locale}
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold transition-colors ${
                    paid ? "bg-fleet-moss/15 text-fleet-moss-text hover:bg-fleet-moss/25" : "bg-fleet-coral/15 text-fleet-coral-text hover:bg-fleet-coral/25"
                  }`}
                >
                  {paid ? t("salaries_paid_label") : t("salaries_unpaid_label")}
                </ConfirmSubmitButton>
              </form>
            </>
          )}
        </div>
        <div className="flex w-7 shrink-0 justify-center">
          {!paid && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("edit_word")}
              className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-teal"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
        <div className="flex w-7 shrink-0 justify-center">
          <form action={onDelete}>
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={t("salaries_delete_staff_confirm")}
              destructive
              ariaLabel={t("delete_word")}
              className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
            >
              <Trash2 size={15} />
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {error && <p className="px-1 text-xs text-fleet-coral-text">{error}</p>}

      <LoansPanel locale={locale} personRef={personRef} loans={loans} repayments={repayments} open={showLoans} onToggle={() => setShowLoans((s) => !s)} />
    </div>
  );
}

// One independent toggle per payment method, for a period split between
// cash and bank - each side is its own real payment, marked/unmarked (and
// its own expense row created/deleted) on its own, same as the single
// combined pill is for a non-split period.
function SplitPaymentToggle({
  locale,
  periodId,
  amount,
  amountLabel,
  paidAt,
  method,
  setError,
}: {
  locale: Locale;
  periodId: string;
  amount: number;
  amountLabel: string;
  paidAt: string | null;
  method: "cash" | "bank";
  setError: (e: string | null) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const paid = Boolean(paidAt);

  return (
    <div className="flex items-center gap-1.5">
      <span className="whitespace-nowrap text-2xs text-fleet-ink">{amountLabel}</span>
      <span className="whitespace-nowrap text-xs font-bold text-fleet-navy">{formatCurrency(amount)}</span>
      <form
        action={async () => {
          setError(null);
          try {
            if (paid) {
              await unmarkSalaryPeriodPaid(periodId, method);
            } else {
              const result = await markSalaryPeriodPaid(periodId, method);
              if (result?.error) setError(result.error);
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : t("save_failed"));
          }
        }}
      >
        <ConfirmSubmitButton
          locale={locale}
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold transition-colors ${
            paid ? "bg-fleet-moss/15 text-fleet-moss-text hover:bg-fleet-moss/25" : "bg-fleet-coral/15 text-fleet-coral-text hover:bg-fleet-coral/25"
          }`}
        >
          {paid ? t("salaries_paid_label") : t("salaries_unpaid_label")}
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

function SalaryEditForm({
  locale,
  periodMonth,
  personRef,
  name,
  subtitle,
  baseSalary,
  startDate,
  period,
  loans,
  repayments,
  onDone,
}: {
  locale: Locale;
  periodMonth: string;
  personRef: PersonRef;
  name: string;
  subtitle: string | null;
  baseSalary: number;
  startDate: string | null;
  period: SalaryPeriod | null;
  loans: StaffLoan[];
  repayments: StaffLoanRepayment[];
  onDone: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const dim = daysInMonth(periodMonth);
  const activeLoan = activeLoanFor(loans, repayments);

  // Defaults to the person's standing salary, but editable per month right
  // here - e.g. a raise that should only apply going forward, or a one-off
  // different amount - same "saved period overrides the standing value"
  // pattern as bonus/notes/cash-bank split below.
  const [baseAmount, setBaseAmount] = useState(String(period?.base_amount ?? baseSalary));
  const [leftDuringMonth, setLeftDuringMonth] = useState(period ? !period.full_month : false);
  const [leftDate, setLeftDate] = useState(period?.left_date ?? "");
  const [bonus, setBonus] = useState(period?.bonus_amount != null ? String(period.bonus_amount) : "");
  const [bonusDescription, setBonusDescription] = useState(period?.bonus_description ?? "");
  const [addingExtra, setAddingExtra] = useState(false);
  // One shared amount+description pair covers both an extra payment and a
  // deduction (loan repayment, an advance, anything else that comes up) -
  // the only difference is the sign it's saved with. The amount field
  // itself always shows a plain positive magnitude; this just tracks which
  // button opened the form so the sign can be applied underneath.
  const [extraSign, setExtraSign] = useState<1 | -1>(period?.bonus_amount != null && period.bonus_amount < 0 ? -1 : 1);
  const [cash, setCash] = useState(period?.cash_amount != null ? String(period.cash_amount) : "");
  const [bank, setBank] = useState(period?.bank_amount != null ? String(period.bank_amount) : "");
  // Paid by bank by default (her explicit call) - the Bank/Cash boxes only
  // show once she opts into a split. An already-saved period that has any
  // cash recorded (split, or paid in cash only) still opens with both
  // boxes visible rather than being silently reinterpreted as a bank-only
  // payment.
  const [splitPayment, setSplitPayment] = useState((period?.cash_amount ?? 0) > 0);
  const [notes, setNotes] = useState(period?.notes ?? "");
  // Prefilled from the active loan's agreed monthly amount, but this
  // specific month's figure is what actually gets deducted when marking
  // paid - so an already-saved period's own value always wins over the
  // loan's standing plan.
  const [loanRepaymentAmount, setLoanRepaymentAmount] = useState(
    period?.loan_repayment_amount != null
      ? String(period.loan_repayment_amount)
      : activeLoan?.loan.monthly_repayment != null
        ? String(activeLoan.loan.monthly_repayment)
        : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every calendar day of the leave date counts (weekends included), same
  // as days_in_month itself - so the day-of-month number IS the day count
  // from the 1st through the last working day.
  const daysWorked = leftDate ? Number(leftDate.slice(8, 10)) : null;
  const prorated = leftDuringMonth && daysWorked != null ? round2(((Number(baseAmount) || 0) / dim) * daysWorked) : null;
  const effectiveBase = leftDuringMonth ? (prorated ?? 0) : Number(baseAmount) || 0;
  const total = round2(effectiveBase + (Number(bonus) || 0));

  const onCashChange = (v: string) => {
    setCash(v);
    setBank(String(round2(Math.max(0, total - (Number(v) || 0)))));
  };
  const onBankChange = (v: string) => {
    setBank(v);
    setCash(String(round2(Math.max(0, total - (Number(v) || 0)))));
  };

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await upsertSalaryPeriod(personRef, periodMonth, formData);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("save_failed"));
        } finally {
          setSaving(false);
        }
      }}
      className={FORM_CARD_CLASS}
    >
      {/* Header: name/role on one side, status + close on the other. The
          edit panel only ever opens for an unpaid period (see the pencil
          button's !paid guard in SalaryRow), so this is always "Unpaid" -
          shown for orientation, not as a toggle (that lives on the closed
          row's own pill). */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-fleet-navy">{name}</div>
          {subtitle && <div className="truncate text-xs text-fleet-ink">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap rounded-full bg-fleet-coral/15 px-2 py-0.5 text-2xs font-bold text-fleet-coral-text">
            {t("salaries_unpaid_label")}
          </span>
          <button
            type="button"
            onClick={onDone}
            aria-label={t("close_word")}
            className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("salaries_base_salary_field")}</label>
        <input
          name="base_amount"
          type="number"
          step="0.01"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          className={INPUT_CLASS_COMPACT}
        />
      </div>

      {/* Row 1: start date + left-during-month, leave date alongside once
          checked. 2 columns on mobile, 3 once the leave date joins them. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StartDateField locale={locale} personRef={personRef} startDate={startDate} />
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-fleet-ink">
          <input type="checkbox" name="left_during_month" checked={leftDuringMonth} onChange={(e) => setLeftDuringMonth(e.target.checked)} />
          {t("salaries_left_during_month_label")}
        </label>
        {leftDuringMonth && (
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <label className="text-xs text-fleet-ink">{t("salaries_left_date_field")}</label>
            <DateInput
              name="left_date"
              value={leftDate}
              onChange={setLeftDate}
              locale={locale}
              min={`${periodMonth.slice(0, 7)}-01`}
              max={`${periodMonth.slice(0, 7)}-${String(dim).padStart(2, "0")}`}
              className={INPUT_CLASS_COMPACT}
            />
          </div>
        )}
      </div>
      {leftDuringMonth && (daysWorked != null || prorated != null) && (
        <div className="text-2xs text-fleet-ink">
          {daysWorked != null && `${daysWorked} ${t("salaries_of_days_in_month", { days: dim })}`}
          {prorated != null && `  ·  ${t("salaries_prorated_label")}: ${formatCurrency(prorated)}`}
        </div>
      )}

      <input type="hidden" name="bonus_amount" value={bonus} />
      <input type="hidden" name="bonus_description" value={bonusDescription} />

      {activeLoan && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-coral/40 bg-fleet-coral/5 p-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-fleet-coral-text">
            <AlertTriangle size={13} /> {t("salaries_loan_repayment_field")}
          </label>
          <input
            name="loan_repayment_amount"
            type="number"
            step="0.01"
            value={loanRepaymentAmount}
            onChange={(e) => setLoanRepaymentAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={INPUT_CLASS_COMPACT}
          />
          <div className="text-2xs text-fleet-ink">
            {t("salaries_loan_outstanding_label")}: {formatCurrency(activeLoan.outstanding)}
          </div>
        </div>
      )}

      {/* Row 2: Total due, Bank and Cash together - the total stays the
          most prominent number on the card; Cash only becomes a real field
          once she opts into a split, otherwise that slot holds the toggle. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label className="text-xs text-fleet-ink">{t("salaries_total_field")}</label>
          <div className="flex h-8 items-center text-lg font-bold text-fleet-navy">{formatCurrency(total)}</div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fleet-ink">{t("salaries_bank_amount_field")}</label>
          {splitPayment ? (
            <input
              name="bank_amount"
              type="number"
              step="0.01"
              value={bank}
              onChange={(e) => onBankChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={INPUT_CLASS_COMPACT}
            />
          ) : (
            <>
              <input type="hidden" name="bank_amount" value={total} />
              <div className="flex h-8 items-center text-sm font-semibold text-fleet-navy">{formatCurrency(total)}</div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {splitPayment ? (
            <>
              <label className="text-xs text-fleet-ink">{t("salaries_cash_amount_field")}</label>
              <input
                name="cash_amount"
                type="number"
                step="0.01"
                value={cash}
                onChange={(e) => onCashChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={INPUT_CLASS_COMPACT}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="cash_amount" value="" />
              <span className="h-[17px]" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setSplitPayment(true);
                  setBank(String(total));
                  setCash("0");
                }}
                className="flex h-8 items-center text-xs font-medium text-fleet-brass hover:underline"
              >
                + {t("salaries_split_payment_cta")}
              </button>
            </>
          )}
        </div>
      </div>
      {splitPayment && (
        <button
          type="button"
          onClick={() => {
            setSplitPayment(false);
            setCash("");
            setBank("");
          }}
          className="self-start text-2xs text-fleet-ink underline"
        >
          {t("salaries_cancel_split_payment")}
        </button>
      )}

      {/* Extra/deduction - one shared amount+description pair, saved
          positive (an extra payment) or negative (a deduction - loan
          repayment, an advance, anything else that comes up) depending on
          which of the two small buttons opened it. A compact one-line
          summary once set, two small (not full-width) buttons otherwise. */}
      {addingExtra ? (
        <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper/40 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fleet-ink">
                {t(extraSign === 1 ? "salaries_bonus_field" : "salaries_deduction_field")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={bonus ? String(Math.abs(Number(bonus))) : ""}
                onChange={(e) => {
                  const magnitude = Math.abs(Number(e.target.value) || 0);
                  setBonus(magnitude ? String(extraSign * magnitude) : "");
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className={INPUT_CLASS_COMPACT}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fleet-ink">
                {t(extraSign === 1 ? "salaries_extra_description_field" : "salaries_deduction_description_field")}
              </label>
              <input
                value={bonusDescription}
                onChange={(e) => setBonusDescription(e.target.value)}
                placeholder={t(extraSign === 1 ? "salaries_extra_description_field" : "salaries_deduction_description_field")}
                className={INPUT_CLASS_COMPACT}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBonus("");
                setBonusDescription("");
                setAddingExtra(false);
              }}
              className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-semibold text-fleet-ink"
            >
              {t("close_word")}
            </button>
            <button
              type="button"
              onClick={() => setAddingExtra(false)}
              className="flex-1 rounded-lg bg-fleet-teal py-1.5 text-xs font-bold text-white"
            >
              {t("save_word")}
            </button>
          </div>
        </div>
      ) : bonus && Number(bonus) !== 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-fleet-border px-2.5 py-1.5 text-xs">
          <span className={`truncate font-semibold ${Number(bonus) < 0 ? "text-fleet-coral-text" : "text-fleet-navy"}`}>
            {t(Number(bonus) > 0 ? "salaries_extra_label" : "salaries_deduction_label")}:{" "}
            {Number(bonus) > 0 ? `+${formatCurrency(Number(bonus))}` : formatCurrencySigned(Number(bonus))}
            {bonusDescription && ` - ${bonusDescription}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setBonus("");
              setBonusDescription("");
            }}
            aria-label={t("remove_word")}
            className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex w-fit gap-2">
          <button
            type="button"
            onClick={() => {
              setExtraSign(1);
              setAddingExtra(true);
            }}
            className="flex items-center gap-1 rounded-lg border border-dashed border-fleet-brass px-2.5 py-1 text-xs font-semibold text-fleet-navy"
          >
            <Plus size={13} /> {t("salaries_add_bonus_button")}
          </button>
          <button
            type="button"
            onClick={() => {
              setExtraSign(-1);
              setAddingExtra(true);
            }}
            className="flex items-center gap-1 rounded-lg border border-dashed border-fleet-border px-2.5 py-1 text-xs font-semibold text-fleet-ink"
          >
            <Minus size={13} /> {t("salaries_add_deduction_button")}
          </button>
        </div>
      )}

      {/* Notes - collapsed behind a small link until clicked, or already
          shown open when a note already exists. */}
      <CollapsibleField label={t("salaries_add_note_cta")} hasValue={Boolean(period?.notes)}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notes_field")}
          rows={2}
          autoFocus={!period?.notes}
          className={`${INPUT_CLASS} resize-none`}
        />
      </CollapsibleField>
      <input type="hidden" name="notes" value={notes} />

      {/* Save/cancel together at the bottom of the card. */}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          {t("cancel_word")}
        </Button>
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : (
            t("save_word")
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
    </form>
  );
}

// Saves immediately on pick (writes to staff/mys_staff, not salary_periods)
// rather than waiting for the surrounding form's own Save button, since it
// isn't actually one of that form's fields. staff.start_date is required
// (never clearable); mys_staff.start_date is optional.
function StartDateField({ locale, personRef, startDate }: { locale: Locale; personRef: PersonRef; startDate: string | null }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [value, setValue] = useState(startDate ?? "");

  const save = async (iso: string) => {
    setValue(iso);
    try {
      if (personRef.staffId != null) {
        if (iso) await setStaffStartDate(personRef.staffId, iso);
      } else {
        await setMysStaffStartDate(personRef.mysStaffId, iso || null);
      }
    } catch (e) {
      console.error("start date update failed:", e);
      setValue(startDate ?? "");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-fleet-ink">{t("employment_start_date")}</label>
      <DateInput value={value} onChange={save} locale={locale} allowClear={!personRef.staffId} className={INPUT_CLASS_COMPACT} />
    </div>
  );
}

function LoansPanel({
  locale,
  personRef,
  loans,
  repayments,
  open,
  onToggle,
}: {
  locale: Locale;
  personRef: PersonRef;
  loans: StaffLoan[];
  repayments: StaffLoanRepayment[];
  open: boolean;
  onToggle: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showAddLoan, setShowAddLoan] = useState(false);

  if (!open) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-dashed border-fleet-border pt-2">
      {loans.length === 0 ? (
        <p className="text-xs text-fleet-ink">{t("salaries_no_loans")}</p>
      ) : (
        loans.map((loan) => {
          const loanRepayments = repayments.filter((r) => r.loan_id === loan.id);
          const repaid = round2(loanRepayments.reduce((s, r) => s + r.amount, 0));
          const outstanding = round2(loan.amount - repaid);
          return (
            <div key={loan.id} className="rounded-lg border border-fleet-border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-fleet-ink">
                  <span dir="ltr">{formatDateDisplay(loan.loan_date)}</span> · {formatCurrency(loan.amount)}
                  {loan.monthly_repayment != null && ` · ${t("salaries_loan_monthly_repayment_field")}: ${formatCurrency(loan.monthly_repayment)}`}
                  {loan.notes && ` · ${loan.notes}`}
                </div>
                <form
                  action={async () => {
                    await deleteStaffLoan(loan.id);
                  }}
                >
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("salaries_delete_loan_confirm")}
                    destructive
                    ariaLabel={t("delete_word")}
                    className="flex h-7 w-7 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                  >
                    <Trash2 size={14} />
                  </ConfirmSubmitButton>
                </form>
              </div>
              <div className="mt-1 flex items-center gap-3 text-2xs text-fleet-ink">
                <span>{t("salaries_loan_repaid_label")}: {formatCurrency(repaid)}</span>
                <span className="font-bold text-fleet-navy">{t("salaries_loan_outstanding_label")}: {formatCurrency(outstanding)}</span>
              </div>
              {loanRepayments.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {loanRepayments.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-2xs text-fleet-ink">
                      <span>
                        <span dir="ltr">{formatDateDisplay(r.repaid_on)}</span> · {formatCurrency(r.amount)}
                        {r.notes && ` · ${r.notes}`}
                      </span>
                      <form action={async () => { await deleteLoanRepayment(r.id); }}>
                        <button type="submit" aria-label={t("delete_word")} className="text-fleet-ink hover:text-fleet-coral-text">
                          <Trash2 size={12} />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
              <RepaymentForm locale={locale} loanId={loan.id} />
            </div>
          );
        })
      )}

      {showAddLoan ? (
        <LoanForm
          locale={locale}
          personRef={personRef}
          onDone={() => setShowAddLoan(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddLoan(true)}
          className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-fleet-brass py-1.5 text-xs font-semibold text-fleet-navy"
        >
          <Plus size={14} /> {t("salaries_add_loan_button")}
        </button>
      )}
      <button type="button" onClick={onToggle} className="text-2xs text-fleet-ink underline">
        {t("close_word")}
      </button>
    </div>
  );
}

function LoanForm({ locale, personRef, onDone }: { locale: Locale; personRef: PersonRef; onDone: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await createStaffLoan(personRef, formData);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("save_failed"));
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper/40 p-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <input name="amount" type="number" step="0.01" required placeholder={`${t("salaries_loan_amount_field")} *`} className={INPUT_CLASS_COMPACT} />
        <DateInput name="loan_date" defaultValue={todayLocalISO()} locale={locale} className={INPUT_CLASS_COMPACT} />
      </div>
      <input
        name="monthly_repayment"
        type="number"
        step="0.01"
        placeholder={t("salaries_loan_monthly_repayment_field")}
        className={INPUT_CLASS_COMPACT}
      />
      <input name="notes" placeholder={t("notes_field")} className={INPUT_CLASS_COMPACT} />
      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 rounded-lg border border-fleet-border py-1.5 text-xs font-semibold text-fleet-ink">
          {t("close_word")}
        </button>
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-fleet-teal py-1.5 text-xs font-bold text-white disabled:opacity-60">
          {saving ? t("saving_word") : t("save_word")}
        </button>
      </div>
      {error && <p className="text-2xs text-fleet-coral-text">{error}</p>}
    </form>
  );
}

function RepaymentForm({ locale, loanId }: { locale: Locale; loanId: string }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-2xs font-semibold text-fleet-teal underline">
        {t("salaries_add_repayment_button")}
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        try {
          await addLoanRepayment(loanId, formData);
          setOpen(false);
        } finally {
          setSaving(false);
        }
      }}
      className="mt-1 flex items-center gap-2"
    >
      <input name="amount" type="number" step="0.01" required placeholder={t("salaries_repayment_amount_field")} className={INPUT_CLASS_COMPACT} />
      <DateInput name="repaid_on" defaultValue={todayLocalISO()} locale={locale} className={INPUT_CLASS_COMPACT} />
      <button type="submit" disabled={saving} className="rounded-lg bg-fleet-teal px-2 py-1.5 text-2xs font-bold text-white disabled:opacity-60">
        {saving ? "…" : t("save_word")}
      </button>
    </form>
  );
}
