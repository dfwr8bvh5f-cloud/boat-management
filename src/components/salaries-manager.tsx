"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  createMysStaff,
  setStaffStartDate,
  setMysStaffStartDate,
  upsertSalaryPeriod,
  markSalaryPeriodPaid,
  unmarkSalaryPeriodPaid,
  deleteSalaryPeriod,
  createStaffLoan,
  deleteStaffLoan,
  addLoanRepayment,
  deleteLoanRepayment,
} from "@/lib/actions/salaries";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysStaff, SalaryPeriod, Staff, StaffLoan, StaffLoanRepayment } from "@/lib/types/database";
import { formatCurrency, round2 } from "@/lib/money";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { INPUT_CLASS, INPUT_CLASS_COMPACT, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

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
}: {
  locale: Locale;
  periodMonth: string;
  staff: Staff[];
  mysStaff: MysStaff[];
  boats: { id: string; name: string }[];
  periods: SalaryPeriod[];
  loans: StaffLoan[];
  repayments: StaffLoanRepayment[];
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const boatNameById = useMemo(() => new Map(boats.map((b) => [b.id, b.name])), [boats]);
  const periodByStaffId = useMemo(() => new Map(periods.filter((p) => p.staff_id).map((p) => [p.staff_id as string, p])), [periods]);
  const periodByMysStaffId = useMemo(
    () => new Map(periods.filter((p) => p.mys_staff_id).map((p) => [p.mys_staff_id as string, p])),
    [periods]
  );

  // The "x" dismiss on a row only hides it from this view for the rest of
  // this visit (declutter, e.g. someone who clearly has nothing to do this
  // month) - it's local UI state, not persisted, so switching months or
  // reloading brings everyone back.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const hideId = (id: string) => setHiddenIds((prev) => new Set(prev).add(id));

  // Shown for the month if still active today, or if there's already a
  // (historical) period row for this specific month - so deactivating
  // someone after they were paid never hides what already happened. Also
  // dropped entirely if their boat isn't in the `boats` list at all (the
  // page already excludes inactive/demo boats there) - a crew member of a
  // boat that's out of the fleet has no payroll obligation here.
  const boatIds = useMemo(() => new Set(boats.map((b) => b.id)), [boats]);
  const visibleStaff = staff
    .filter((m) => boatIds.has(m.boat_id) && (m.active || periodByStaffId.has(m.id)) && !hiddenIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleMysStaff = mysStaff
    .filter((m) => (m.active || periodByMysStaffId.has(m.id)) && !hiddenIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const staffByBoat = useMemo(() => {
    const map = new Map<string, Staff[]>();
    for (const m of visibleStaff) {
      (map.get(m.boat_id) ?? map.set(m.boat_id, []).get(m.boat_id)!).push(m);
    }
    return map;
  }, [visibleStaff]);

  const [showAddOffice, setShowAddOffice] = useState(false);

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
            <ChevronLeft size={16} />
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
            <ChevronRight size={16} />
          </Link>
        </div>
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
          [...staffByBoat.entries()].map(([boatId, members]) => (
            <div key={boatId} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-fleet-ink">{boatNameById.get(boatId) ?? ""}</div>
              {members.map((m) => (
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
                  onHide={() => hideId(m.id)}
                />
              ))}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-fleet-navy">
            <Landmark size={16} /> {t("salaries_office_section_title")}
          </h2>
          <button
            onClick={() => setShowAddOffice((s) => !s)}
            className="flex items-center gap-1 rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-semibold text-fleet-paper hover:opacity-90"
          >
            {showAddOffice ? <X size={14} /> : <Plus size={14} />}
            {showAddOffice ? t("close_word") : t("salaries_add_office_staff_button")}
          </button>
        </div>

        {showAddOffice && <MysStaffForm locale={locale} onDone={() => setShowAddOffice(false)} />}

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
              onHide={() => hideId(m.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function MysStaffForm({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await createMysStaff(formData);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("save_failed"));
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
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
        <button type="button" onClick={onDone} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
          {t("close_word")}
        </button>
        <button type="submit" disabled={saving} className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}>
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : (
            t("save_word")
          )}
        </button>
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
  onHide,
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
  onHide: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const base = baseSalary ?? 0;
  const paid = period?.paid ?? false;
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
      <div className="flex items-center gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fleet-navy">{name}</div>
          {subtitle && <div className="truncate text-xs text-fleet-ink">{subtitle}</div>}
          {!paid && (
            <div className="truncate text-2xs text-fleet-ink">
              {t("salaries_due_date_label")}: <span dir="ltr">{formatDateDisplay(shiftMonth(periodMonth, 1))}</span>
            </div>
          )}
        </div>
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
        <span className="whitespace-nowrap font-bold text-fleet-navy">{formatCurrency(savedTotal)}</span>
        {period ? (
          <form
            action={async () => {
              setError(null);
              try {
                if (paid) {
                  await unmarkSalaryPeriodPaid(period.id);
                } else {
                  const result = await markSalaryPeriodPaid(period.id);
                  if (result?.error) setError(result.error);
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : t("save_failed"));
              }
            }}
          >
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={paid ? t("salaries_unmark_paid_confirm") : t("salaries_mark_paid_confirm")}
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold transition-colors ${
                paid ? "bg-fleet-moss text-white" : "bg-fleet-paper text-fleet-ink hover:bg-fleet-moss/20"
              }`}
            >
              {paid ? t("salaries_paid_label") : t("salaries_unpaid_label")}
            </ConfirmSubmitButton>
          </form>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-fleet-paper px-2 py-0.5 text-2xs font-bold text-fleet-ink">
            {t("salaries_unpaid_label")}
          </span>
        )}
        {!paid && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="edit salary period"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-teal"
          >
            <Pencil size={15} />
          </button>
        )}
        {period && !paid && (
          <form
            action={async () => {
              setError(null);
              const result = await deleteSalaryPeriod(period.id);
              if (result?.error) setError(result.error);
            }}
          >
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={t("salaries_delete_period_confirm")}
              ariaLabel={t("delete_word")}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
            >
              <Trash2 size={15} />
            </ConfirmSubmitButton>
          </form>
        )}
        <button
          type="button"
          onClick={onHide}
          aria-label={t("salaries_hide_row")}
          title={t("salaries_hide_row")}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
        >
          <X size={15} />
        </button>
      </div>

      {error && <p className="px-1 text-xs text-fleet-coral-text">{error}</p>}

      <LoansPanel locale={locale} personRef={personRef} loans={loans} repayments={repayments} open={showLoans} onToggle={() => setShowLoans((s) => !s)} />
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

  const [leftDuringMonth, setLeftDuringMonth] = useState(period ? !period.full_month : false);
  const [leftDate, setLeftDate] = useState(period?.left_date ?? "");
  const [bonus, setBonus] = useState(period?.bonus_amount != null ? String(period.bonus_amount) : "");
  const [addingBonus, setAddingBonus] = useState(false);
  const [cash, setCash] = useState(period?.cash_amount != null ? String(period.cash_amount) : "");
  const [bank, setBank] = useState(period?.bank_amount != null ? String(period.bank_amount) : "");
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
  const prorated = leftDuringMonth && daysWorked != null ? round2((baseSalary / dim) * daysWorked) : null;
  const effectiveBase = leftDuringMonth ? (prorated ?? 0) : baseSalary;
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
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-3"
    >
      <input type="hidden" name="base_amount" value={baseSalary} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-fleet-navy">{name}</div>
          {subtitle && <div className="text-xs text-fleet-ink">{subtitle}</div>}
        </div>
        <button type="button" onClick={onDone} aria-label={t("close_word")} className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text">
          <X size={16} />
        </button>
      </div>

      <StartDateField locale={locale} personRef={personRef} startDate={startDate} />

      <label className="flex items-center gap-2 text-xs text-fleet-ink">
        <input type="checkbox" name="left_during_month" checked={leftDuringMonth} onChange={(e) => setLeftDuringMonth(e.target.checked)} />
        {t("salaries_left_during_month_label")}
      </label>

      {leftDuringMonth && (
        <div className="flex flex-col gap-1.5">
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
          {daysWorked != null && (
            <div className="text-2xs text-fleet-ink">
              {daysWorked} {t("salaries_of_days_in_month", { days: dim })}
            </div>
          )}
          {prorated != null && <div className="text-2xs text-fleet-ink">{t("salaries_prorated_label")}: {formatCurrency(prorated)}</div>}
        </div>
      )}

      <input type="hidden" name="bonus_amount" value={bonus} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("salaries_bonus_field")}</label>
          {addingBonus ? (
            <input
              type="number"
              step="0.01"
              autoFocus
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              onBlur={() => setAddingBonus(false)}
              onWheel={(e) => e.currentTarget.blur()}
              className={INPUT_CLASS_COMPACT}
            />
          ) : bonus && Number(bonus) > 0 ? (
            <div className="flex h-8 items-center gap-1.5">
              <span className="text-sm font-bold text-fleet-navy">{formatCurrency(Number(bonus))}</span>
              <button type="button" onClick={() => setBonus("")} aria-label="remove bonus" className="text-fleet-ink hover:text-fleet-coral-text">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingBonus(true)}
              aria-label={t("salaries_add_bonus_button")}
              title={t("salaries_add_bonus_button")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-fleet-brass text-fleet-navy"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("salaries_total_field")}</label>
          <div className="flex h-8 items-center text-sm font-bold text-fleet-navy">{formatCurrency(total)}</div>
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
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
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("salaries_bank_amount_field")}</label>
          <input
            name="bank_amount"
            type="number"
            step="0.01"
            value={bank}
            onChange={(e) => onBankChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={INPUT_CLASS_COMPACT}
          />
        </div>
      </div>

      <textarea
        name="notes"
        placeholder={t("notes_field")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className={`${INPUT_CLASS} resize-none`}
      />

      <button type="submit" disabled={saving} className={`flex items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}>
        {saving ? (
          <>
            <RippleLoader size="sm" /> {t("saving_word")}
          </>
        ) : (
          t("save_word")
        )}
      </button>
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
                        <button type="submit" className="text-fleet-ink hover:text-fleet-coral-text">
                          <X size={12} />
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
