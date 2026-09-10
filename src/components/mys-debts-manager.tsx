"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { settleMysCharge, createMysAdHocCharge, markMysAdHocChargePaid, deleteMysAdHocCharge, createMysClient } from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysAdHocCharge } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type BoatCharge = { id: string; boat_id: string; description: string; amount: number; expense_date: string | null; boatName: string };
type Invoice = {
  id: string;
  boat_id: string | null;
  invoice_number: string;
  client_name: string;
  amount: number;
  issued_date: string;
  due_date: string | null;
  boatName: string | null;
};

type DebtRow =
  | { kind: "charge"; id: string; boatId: string; boatName: string; label: string; amount: number; date: string | null }
  | { kind: "ad_hoc"; id: string; boatId: null; boatName: string; label: string; amount: number; date: string | null }
  | { kind: "invoice"; id: string; boatId: string | null; boatName: string; label: string; amount: number; date: string | null };

type SortBy = "date_desc" | "date_asc" | "client" | "amount";

export function MysDebtsManager({
  boats,
  charges,
  adHocCharges,
  invoices,
  clientNames,
  locale,
}: {
  boats: { id: string; name: string }[];
  charges: BoatCharge[];
  adHocCharges: MysAdHocCharge[];
  invoices: Invoice[];
  clientNames: string[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);

  const [boatFilter, setBoatFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [showAdHocForm, setShowAdHocForm] = useState(false);
  const [chargeDate, setChargeDate] = useState(todayLocalISO());
  const [adHocClientName, setAdHocClientName] = useState("");
  const [adHocError, setAdHocError] = useState<string | null>(null);
  const [savingAdHoc, setSavingAdHoc] = useState(false);
  // A name that matches one of the fleet's own boats gets charged straight
  // onto that boat's own expenses (see createMysAdHocCharge) instead of
  // becoming a standalone ad-hoc-charge record - shown here purely as a
  // hint; the actual routing decision is made server-side.
  const boatNameSet = useMemo(() => new Set(boats.map((b) => b.name)), [boats]);
  const adHocClientIsBoat = boatNameSet.has(adHocClientName);

  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  const rows: DebtRow[] = useMemo(
    () => [
      ...charges.map(
        (c): DebtRow => ({ kind: "charge", id: c.id, boatId: c.boat_id, boatName: c.boatName, label: c.description, amount: c.amount, date: c.expense_date }),
      ),
      ...adHocCharges.map(
        (c): DebtRow => ({ kind: "ad_hoc", id: c.id, boatId: null, boatName: c.client_name, label: c.description, amount: c.amount, date: c.charge_date }),
      ),
      ...invoices.map(
        (i): DebtRow => ({
          kind: "invoice",
          id: i.id,
          boatId: i.boat_id,
          boatName: i.boatName ?? i.client_name,
          label: `${i.invoice_number} - ${i.client_name}`,
          amount: i.amount,
          date: i.issued_date,
        }),
      ),
    ],
    [charges, adHocCharges, invoices],
  );

  const boatsWithDebts = useMemo(() => {
    const ids = new Set(rows.filter((r) => r.boatId).map((r) => r.boatId as string));
    return boats.filter((b) => ids.has(b.id));
  }, [boats, rows]);

  const sortedFilteredRows = useMemo(() => {
    const filtered = boatFilter ? rows.filter((r) => r.boatId === boatFilter) : rows;
    const sorted = filtered.slice();
    switch (sortBy) {
      case "date_asc":
        sorted.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
        break;
      case "client":
        sorted.sort((a, b) => a.boatName.localeCompare(b.boatName));
        break;
      case "amount":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      default:
        sorted.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }
    return sorted;
  }, [rows, boatFilter, sortBy]);
  const total = sortedFilteredRows.reduce((s, r) => s + r.amount, 0);

  const doCreateAdHoc = async (formData: FormData) => {
    setAdHocError(null);
    if (!adHocClientName) {
      setAdHocError(t("mys_client_required"));
      return;
    }
    setSavingAdHoc(true);
    try {
      await createMysAdHocCharge(formData);
      setShowAdHocForm(false);
      setChargeDate(todayLocalISO());
      setAdHocClientName("");
    } catch (e) {
      setAdHocError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingAdHoc(false);
    }
  };

  const doAddClient = async (formData: FormData) => {
    setAddClientError(null);
    setSavingClient(true);
    try {
      await createMysClient(formData);
      setShowAddClientForm(false);
      setNewClientName("");
    } catch (e) {
      setAddClientError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSavingClient(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_outstanding_debts")}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => (showAddClientForm ? setShowAddClientForm(false) : setShowAddClientForm(true))}
            className="rounded-full border border-fleet-border bg-white px-4 py-2 text-sm font-semibold text-fleet-navy hover:bg-fleet-paper"
          >
            {showAddClientForm ? (
              <span className="inline-flex items-center gap-1">
                <X size={14} /> {t("close_word")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("mys_add_client")}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAdHocForm((s) => !s)}
            className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            {showAdHocForm ? (
              <span className="inline-flex items-center gap-1">
                <X size={14} /> {t("close_word")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus size={14} /> {t("mys_add_ad_hoc_charge")}
              </span>
            )}
          </button>
        </div>
      </div>

      {showAddClientForm && (
        <form action={doAddClient} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_client_name_label")} *</label>
            <input name="name" required value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className={INPUT_CLASS} />
          </div>
          {addClientError && <p className="text-xs text-fleet-coral-text">{addClientError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAddClientForm(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={savingClient} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {savingClient ? t("saving_word") : t("mys_add_client")}
            </button>
          </div>
        </form>
      )}

      {showAdHocForm && (
        <form action={doCreateAdHoc} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <CustomSelect
              name="client_name"
              value={adHocClientName}
              onChange={setAdHocClientName}
              options={clientNames.map((name) => ({ value: name, label: name }))}
              placeholder={t("mys_client_select_placeholder")}
              emphasizeEmpty
              className={INPUT_CLASS}
            />
            {adHocClientIsBoat && <p className="text-2xs text-fleet-ink">{t("mys_ad_hoc_charge_boat_hint")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("description")} *</label>
            <input name="description" required className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("amount")} *</label>
              <input name="amount" type="number" step="0.01" required onWheel={(e) => e.currentTarget.blur()} className={INPUT_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("date")}</label>
              <DateInput name="charge_date" value={chargeDate} onChange={setChargeDate} locale={locale} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("new_expense_notes")}</label>
            <textarea name="notes" rows={2} className={INPUT_CLASS} />
          </div>
          {adHocError && <p className="text-xs text-fleet-coral-text">{adHocError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdHocForm(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={savingAdHoc} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {savingAdHoc ? t("saving_word") : t("mys_add_ad_hoc_charge")}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {boatsWithDebts.length > 0 && (
          <CustomSelect
            value={boatFilter}
            onChange={setBoatFilter}
            options={[{ value: "", label: t("mys_all_boats_filter") }, ...boatsWithDebts.map((b) => ({ value: b.id, label: b.name }))]}
            className={`w-fit ${INPUT_CLASS}`}
          />
        )}
        <CustomSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortBy)}
          options={[
            { value: "date_desc", label: `${t("mys_sort_label")}: ${t("mys_sort_date_desc")}` },
            { value: "date_asc", label: `${t("mys_sort_label")}: ${t("mys_sort_date_asc")}` },
            { value: "client", label: `${t("mys_sort_label")}: ${t("mys_client_label")}` },
            { value: "amount", label: `${t("mys_sort_label")}: ${t("amount")}` },
          ]}
          className={`w-fit ${INPUT_CLASS}`}
        />
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("total")}: {formatCurrency(total)}
      </div>

      {sortedFilteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_debts")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedFilteredRows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{r.label}</div>
                <div className="truncate text-xs text-fleet-ink">
                  {r.boatName}
                  {r.date && (
                    <>
                      {" · "}
                      <span dir="ltr">{formatDateDisplay(r.date)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-sm font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
              {r.kind === "charge" && (
                <form action={settleMysCharge.bind(null, r.boatId, r.id)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("mys_settle_charge_confirm")}
                    className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                  >
                    {t("mys_mark_settled")}
                  </ConfirmSubmitButton>
                </form>
              )}
              {r.kind === "ad_hoc" && (
                <div className="flex shrink-0 gap-1">
                  <form action={markMysAdHocChargePaid.bind(null, r.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_settle_charge_confirm")}
                      className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                    >
                      {t("mys_mark_settled")}
                    </ConfirmSubmitButton>
                  </form>
                  <form action={deleteMysAdHocCharge.bind(null, r.id)}>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmMessage={t("mys_delete_ad_hoc_charge_confirm")}
                      ariaLabel={t("delete_word")}
                      className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <X size={14} />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
