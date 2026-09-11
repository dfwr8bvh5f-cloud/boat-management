"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, X } from "lucide-react";
import {
  settleMysCharge,
  createMysAdHocCharge,
  markMysAdHocChargePaid,
  deleteMysAdHocCharge,
  createMysClient,
  updateMysInvoice,
  updateMysInvoiceLine,
  addMysInvoicePayment,
  voidMysInvoice,
} from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { MysInvoiceFromDebtsForm, type SelectedDebtRow } from "@/components/mys-invoice-from-debts-form";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysAdHocCharge, MysInvoiceLine, MysInvoicePayment, MysInvoiceStatus } from "@/lib/types/database";
import { INPUT_CLASS, INPUT_CLASS_INLINE, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type BoatCharge = { id: string; boat_id: string; description: string; amount: number; expense_date: string | null; boatName: string };
type Invoice = {
  id: string;
  boat_id: string | null;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  client_company_details: string | null;
  description: string;
  status: MysInvoiceStatus;
  amount: number;
  vat_amount: number;
  // What's actually still owed on this invoice (total minus any payments
  // already recorded via addMysInvoicePayment) - precomputed on the page,
  // not the invoice's original amount/vat_amount.
  remainingAmount: number;
  issued_date: string;
  due_date: string | null;
  boatName: string | null;
  lines: MysInvoiceLine[];
  payments: MysInvoicePayment[];
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
  const router = useRouter();

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

  const invoicesById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

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
          amount: i.remainingAmount,
          date: i.issued_date,
        }),
      ),
    ],
    [charges, adHocCharges, invoices],
  );

  // Billable selection for "issue invoice" - only "charge"/"ad_hoc" rows
  // can be selected (an "invoice" row is already invoiced). Every selected
  // row must share the same client: once the first pick locks in a client,
  // any row for a different one is disabled - an invoice can only ever go
  // to one client.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const rowKey = (r: DebtRow) => `${r.kind}-${r.id}`;
  const selectedRows = useMemo(() => rows.filter((r) => r.kind !== "invoice" && selectedKeys.has(rowKey(r))), [rows, selectedKeys]);
  const lockedClientName = selectedRows[0]?.boatName ?? null;
  const toggleSelected = (r: DebtRow) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = rowKey(r);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const invoiceFormRows: SelectedDebtRow[] = selectedRows.map((r) => ({
    kind: r.kind as "charge" | "ad_hoc",
    id: r.id,
    description: r.label,
    amount: r.amount,
    boatId: r.boatId,
    clientName: r.boatName,
  }));

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

  // --- Edit an existing invoice (description/client/due-date always,
  // amount/vat only for a lines-less, manually-typed invoice - see
  // updateMysInvoice, src/lib/actions/mys.ts). The attached invoice file
  // itself stays managed from the Invoices page, not here. ---
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientCompanyDetails, setEditClientCompanyDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editVatAmount, setEditVatAmount] = useState("");
  const [editLines, setEditLines] = useState<{ id: string; description: string; amount: string; vat_percent: string }[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEditInvoice = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setEditDescription(inv.description);
    setEditClientName(inv.client_name);
    setEditClientEmail(inv.client_email ?? "");
    setEditClientCompanyDetails(inv.client_company_details ?? "");
    setEditDueDate(inv.due_date ?? "");
    setEditAmount(String(inv.amount));
    setEditVatAmount(String(inv.vat_amount));
    setEditLines(inv.lines.map((l) => ({ id: l.id, description: l.description, amount: String(l.amount), vat_percent: String(l.vat_percent) })));
    setEditError(null);
  };
  const setEditLineField = (id: string, field: "description" | "amount" | "vat_percent", value: string) =>
    setEditLines((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  const closeEditInvoice = () => {
    setEditingInvoiceId(null);
    setEditError(null);
  };

  const doSaveEditInvoice = async (invoiceId: string) => {
    setEditError(null);
    setEditSaving(true);
    try {
      await Promise.all(
        editLines.map((l) => {
          const lineFd = new FormData();
          lineFd.set("description", l.description);
          lineFd.set("amount", l.amount);
          lineFd.set("vat_percent", l.vat_percent);
          return updateMysInvoiceLine(l.id, lineFd);
        })
      );
      const fd = new FormData();
      fd.set("client_name", editClientName);
      fd.set("client_email", editClientEmail);
      fd.set("client_company_details", editClientCompanyDetails);
      fd.set("description", editDescription);
      fd.set("due_date", editDueDate);
      fd.set("amount", editAmount);
      fd.set("vat_amount", editVatAmount);
      // The attached file (invoice_path) is managed from the Invoices page
      // only - omit it here so this save never touches it.
      await updateMysInvoice(invoiceId, fd);
      closeEditInvoice();
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setEditSaving(false);
    }
  };

  // --- Record a (possibly partial) payment against a 'sent'/'draft' invoice ---
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayLocalISO());
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const startPayment = (inv: Invoice) => {
    setPayingInvoiceId(inv.id);
    setPayAmount(String(inv.remainingAmount));
    setPayDate(todayLocalISO());
    setPayNotes("");
    setPayError(null);
  };
  const closePayment = () => {
    setPayingInvoiceId(null);
    setPayError(null);
  };
  const doSavePayment = async (invoiceId: string) => {
    setPayError(null);
    setPaySaving(true);
    try {
      const fd = new FormData();
      fd.set("amount", payAmount);
      fd.set("paid_date", payDate);
      fd.set("notes", payNotes);
      await addMysInvoicePayment(invoiceId, fd);
      closePayment();
      router.refresh();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setPaySaving(false);
    }
  };

  const [voidError, setVoidError] = useState<string | null>(null);
  // A plain click+confirm (not a <form>-submitted ConfirmSubmitButton) so a
  // thrown error - e.g. voidMysInvoice refusing an invoice that already has
  // payments recorded - can be caught and shown in-line instead of hitting
  // the app's generic error boundary.
  const [pendingVoidId, setPendingVoidId] = useState<string | null>(null);
  const doVoid = async (invoiceId: string) => {
    setVoidError(null);
    try {
      await voidMysInvoice(invoiceId);
      router.refresh();
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : t("save_failed"));
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

      {voidError && (
        <div className="flex items-center gap-2 rounded-lg border border-fleet-coral bg-fleet-coral/10 px-3 py-2 text-xs text-fleet-coral-text">
          <span className="flex-1">{voidError}</span>
          <button type="button" onClick={() => setVoidError(null)} aria-label="dismiss" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {selectedRows.length > 0 && !showInvoicePanel && (
        <button
          type="button"
          onClick={() => setShowInvoicePanel(true)}
          className="flex w-fit items-center gap-1.5 rounded-full bg-fleet-teal px-3.5 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          <FileText size={14} /> {t("mys_issue_invoice_cta")} ({selectedRows.length})
        </button>
      )}
      {showInvoicePanel && selectedRows.length > 0 && (
        <MysInvoiceFromDebtsForm
          rows={invoiceFormRows}
          locale={locale}
          onClose={() => setShowInvoicePanel(false)}
          onDone={() => {
            setSelectedKeys(new Set());
            setShowInvoicePanel(false);
            router.refresh();
          }}
        />
      )}

      {sortedFilteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_debts")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedFilteredRows.map((r) => {
            const selectable = r.kind !== "invoice";
            const disabledByClientLock = selectable && lockedClientName !== null && r.boatName !== lockedClientName;
            const inv = r.kind === "invoice" ? invoicesById.get(r.id) : undefined;
            const isEditingInvoice = r.kind === "invoice" && editingInvoiceId === r.id;
            const isPayingInvoice = r.kind === "invoice" && payingInvoiceId === r.id;
            return (
            <div key={`${r.kind}-${r.id}`} className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
              {isEditingInvoice && inv ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")}</label>
                    <input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                    <input value={editClientEmail} onChange={(e) => setEditClientEmail(e.target.value)} type="email" className={INPUT_CLASS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("mys_client_company_details_label")}</label>
                    <textarea
                      value={editClientCompanyDetails}
                      onChange={(e) => setEditClientCompanyDetails(e.target.value)}
                      placeholder={t("mys_client_company_details_placeholder")}
                      rows={3}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("description")}</label>
                    <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={INPUT_CLASS} />
                  </div>
                  {inv.lines.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_edit_lines_label")}</label>
                      {/* Mirrors the generated invoice document's own table +
                          summary block layout (src/app/(app)/mys/invoices/[id]/page.tsx)
                          so the edit view reads like the real invoice, just with
                          inputs in place of static text. */}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-fleet-paper">
                            <th className="rounded-s-lg px-2 py-1.5 text-start font-semibold text-fleet-ink">{t("description")}</th>
                            <th className="px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("amount")}</th>
                            <th className="rounded-e-lg px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("mys_vat_amount_label")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editLines.map((l) => {
                            const hasVat = (Number(l.vat_percent) || 0) > 0;
                            return (
                              <tr key={l.id}>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5">
                                  <input
                                    value={l.description}
                                    onChange={(e) => setEditLineField(l.id, "description", e.target.value)}
                                    className={`w-full ${INPUT_CLASS_INLINE}`}
                                  />
                                </td>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={l.amount}
                                    onChange={(e) => setEditLineField(l.id, "amount", e.target.value)}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className={`w-24 text-end ${INPUT_CLASS_INLINE}`}
                                  />
                                </td>
                                <td className="border-b border-dotted border-fleet-border px-2 py-1.5 text-end">
                                  {hasVat ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditLineField(l.id, "vat_percent", "0")}
                                      title={t("mys_remove_vat_cta")}
                                      className="inline-flex items-center gap-1 rounded-full bg-fleet-teal/10 px-2 py-1 text-2xs font-bold text-fleet-teal hover:bg-fleet-teal/20"
                                    >
                                      {l.vat_percent}% <X size={11} />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditLineField(l.id, "vat_percent", "24")}
                                      title={t("mys_add_vat_cta")}
                                      className="inline-flex items-center gap-1 rounded-full border border-fleet-border px-2 py-1 text-2xs font-bold text-fleet-ink hover:bg-fleet-paper"
                                    >
                                      <Plus size={11} /> 24%
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {(() => {
                        const linesSubtotal = round2(editLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
                        const linesVat = round2(
                          editLines.reduce((s, l) => s + round2((Number(l.amount) || 0) * ((Number(l.vat_percent) || 0) / 100)), 0)
                        );
                        return (
                          <div className="flex flex-col gap-1 self-end text-xs">
                            <div className="flex justify-between gap-6">
                              <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
                              <span>{formatCurrency(linesSubtotal)}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                              <span>{formatCurrency(linesVat)}</span>
                            </div>
                            <div className="flex justify-between gap-6 border-t border-fleet-border pt-1 font-bold text-fleet-navy">
                              <span>{t("mys_invoice_total_label")}</span>
                              <span>{formatCurrency(round2(linesSubtotal + linesVat))}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {inv.lines.length === 0 ? (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("amount")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-fleet-ink">{t("mys_vat_amount_label")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editVatAmount}
                            onChange={(e) => setEditVatAmount(e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            className={INPUT_CLASS}
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={editDueDate} onChange={setEditDueDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>
                  {editError && <p className="text-xs text-fleet-coral-text">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEditInvoice} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() => doSaveEditInvoice(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {editSaving ? t("saving_word") : t("save_edit")}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-nowrap items-center gap-3">
              {selectable && (
                <input
                  type="checkbox"
                  checked={selectedKeys.has(rowKey(r))}
                  disabled={disabledByClientLock}
                  onChange={() => toggleSelected(r)}
                  aria-label={t("select_row_word")}
                  title={disabledByClientLock ? t("mys_invoice_different_client_hint") : undefined}
                  className="h-4 w-4 shrink-0 rounded border-fleet-border disabled:opacity-40"
                />
              )}
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
              {r.kind === "invoice" && inv && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditInvoice(inv)}
                    aria-label={t("update_word")}
                    title={t("update_word")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                  >
                    <Pencil size={14} />
                  </button>
                  {(inv.status === "draft" || inv.status === "sent") && !isPayingInvoice && (
                    <button
                      type="button"
                      onClick={() => startPayment(inv)}
                      className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                    >
                      {t(inv.status === "draft" ? "mys_mark_paid_cta" : "mys_record_payment_cta")}
                    </button>
                  )}
                  {(inv.status === "draft" || inv.status === "sent") && (
                    <button
                      type="button"
                      onClick={() => setPendingVoidId(inv.id)}
                      aria-label={t("mys_void_invoice")}
                      title={t("mys_void_invoice")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
              </div>
              )}
              {isPayingInvoice && inv && (
                <div className="flex flex-col gap-2 rounded-lg bg-fleet-paper p-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("amount")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-2xs text-fleet-ink">{t("date")}</label>
                      <DateInput value={payDate} onChange={setPayDate} locale={locale} className={INPUT_CLASS} />
                    </div>
                  </div>
                  <input
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder={t("new_expense_notes")}
                    className={INPUT_CLASS}
                  />
                  {payError && <p className="text-xs text-fleet-coral-text">{payError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={closePayment} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                      {t("close_word")}
                    </button>
                    <button
                      type="button"
                      disabled={paySaving}
                      onClick={() => doSavePayment(inv.id)}
                      className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
                    >
                      {paySaving ? t("saving_word") : t("mys_record_payment_cta")}
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {pendingVoidId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setPendingVoidId(null)}>
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-fleet-navy">{t("mys_void_invoice_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPendingVoidId(null)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  doVoid(pendingVoidId);
                  setPendingVoidId(null);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
