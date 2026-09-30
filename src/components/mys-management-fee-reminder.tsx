"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import {
  createMysManagementFeeCharges,
  createMysManagementFeeInvoice,
  skipMysManagementFeePeriod,
  updateMysManagementFeeTemplateAmount,
} from "@/lib/actions/mys-management-fees";
import { DateInput } from "@/components/date-input";
import type { DueManagementFee } from "@/lib/mys-management-fees";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS, INPUT_CLASS_COMPACT, PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Row = DueManagementFee & { boatName: string };
type EditableRow = Row & { editedAmount: string; askingScope: boolean };
type OtherDebt = { kind: "charge" | "ad_hoc"; id: string; description: string; amount: number };

const debtKey = (d: Pick<OtherDebt, "kind" | "id">) => `${d.kind}-${d.id}`;
const FEE_VAT_KEY = "__fee__";

// An inline banner on /mys for every management-fee template due (see
// src/lib/mys-management-fees.ts for the "is this due" logic evaluated
// server-side in mys/page.tsx) - stays in place, embedded on the page like
// the recurring-expenses due banner (mys-recurring-expenses-panel.tsx),
// rather than a blocking popup, since an unhandled row is meant to keep
// showing until she deals with it. Editing a row's amount (via its pencil
// icon) away from its template default asks whether that's a one-time
// correction or the new permanent default
// (updateMysManagementFeeTemplateAmount) - the X skips just this period
// (skipMysManagementFeePeriod) without ever touching the template's stored
// amount. "Add to debts" creates the real charge for every row still here.
// A row can also attach that same boat's other already-open debts
// (expenses billed to MYS with no invoice yet, unpaid ad-hoc charges - same
// universe /mys/debts itself invoices from) and generate one combined
// invoice for all of it via createMysManagementFeeInvoice, instead of
// leaving the fee as a separate open charge next to those debts.
export function MysManagementFeeReminder({
  dueRows,
  otherDebtsByBoatId,
  clientEmailByName,
  locale,
}: {
  dueRows: Row[];
  otherDebtsByBoatId: Record<string, OtherDebt[]>;
  clientEmailByName: Record<string, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();

  const [rows, setRows] = useState<EditableRow[]>(
    dueRows.map((r) => ({ ...r, editedAmount: String(r.amount), askingScope: false }))
  );
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // The "attach open debts" panel - only ever open for one row at a time.
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [selectedDebtKeys, setSelectedDebtKeys] = useState<Set<string>>(new Set());
  const [vatPercentByKey, setVatPercentByKey] = useState<Record<string, string>>({});
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const updateEditedAmount = (templateId: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, editedAmount: value } : r)));

  const cancelAmountEdit = (templateId: string) => {
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, editedAmount: String(r.amount) } : r)));
    setEditingAmountId(null);
  };

  const confirmAmountEdit = (templateId: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.templateId !== templateId) return r;
        const newValue = round2(Number(r.editedAmount) || 0);
        if (newValue === r.amount) {
          setEditingAmountId(null);
          return { ...r, editedAmount: String(newValue) };
        }
        setEditingAmountId(null);
        return { ...r, editedAmount: String(newValue), askingScope: true };
      })
    );

  const resolveScope = async (templateId: string, scope: "once" | "permanent") => {
    const row = rows.find((r) => r.templateId === templateId);
    if (!row) return;
    const newAmount = round2(Number(row.editedAmount) || 0);
    if (scope === "permanent") {
      try {
        await updateMysManagementFeeTemplateAmount(templateId, newAmount);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("save_failed"));
      }
    }
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, amount: newAmount, askingScope: false } : r)));
  };

  const removeRow = (templateId: string, period: string) => {
    if (attachingId === templateId) setAttachingId(null);
    setRows((prev) => prev.filter((r) => r.templateId !== templateId));
    skipMysManagementFeePeriod(templateId, period).catch((e) => {
      console.error("MysManagementFeeReminder: failed to skip period", e);
    });
  };

  const total = round2(rows.reduce((s, r) => s + (Number(r.editedAmount) || 0), 0));
  const hasPendingScopeChoice = rows.some((r) => r.askingScope);

  const doAddToDebts = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await createMysManagementFeeCharges(
        rows.map((r) => ({
          templateId: r.templateId,
          boatId: r.boatId,
          amount: round2(Number(r.editedAmount) || 0),
          description: r.description,
          period: r.period,
        }))
      );
      if (result?.errors && result.errors.length > 0) {
        setError(t("mys_management_fee_partial_error", { list: result.errors.join(", ") }));
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  // Confirms just this one row, independent of every other row still in the
  // list - the bottom "Add to debts" button still exists for handling
  // everything left in one click, but she doesn't have to wait for every
  // due boat before acting on the one she's looking at.
  const doAddOneToDebts = async (r: EditableRow) => {
    setError(null);
    setConfirmingId(r.templateId);
    try {
      const result = await createMysManagementFeeCharges([
        {
          templateId: r.templateId,
          boatId: r.boatId,
          amount: round2(Number(r.editedAmount) || 0),
          description: r.description,
          period: r.period,
        },
      ]);
      if (result?.errors && result.errors.length > 0) {
        setError(t("mys_management_fee_partial_error", { list: result.errors.join(", ") }));
        return;
      }
      setRows((prev) => prev.filter((x) => x.templateId !== r.templateId));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setConfirmingId(null);
    }
  };

  const toggleAttach = (r: EditableRow) => {
    if (attachingId === r.templateId) {
      setAttachingId(null);
      return;
    }
    setAttachingId(r.templateId);
    setSelectedDebtKeys(new Set());
    setVatPercentByKey({});
    setInvoiceDescription(r.description);
    setInvoiceEmail(clientEmailByName[r.boatName] ?? "");
    setInvoiceDueDate("");
    setInvoiceError(null);
  };

  const toggleDebt = (key: string) =>
    setSelectedDebtKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleSelectAllDebts = (debts: OtherDebt[]) =>
    setSelectedDebtKeys((prev) => (prev.size === debts.length ? new Set() : new Set(debts.map(debtKey))));

  const generateInvoice = async (r: EditableRow) => {
    setInvoiceError(null);
    setGeneratingId(r.templateId);
    try {
      const otherDebts = otherDebtsByBoatId[r.boatId] ?? [];
      const selectedDebts = otherDebts.filter((d) => selectedDebtKeys.has(debtKey(d)));
      await createMysManagementFeeInvoice({
        templateId: r.templateId,
        boatId: r.boatId,
        boatName: r.boatName,
        amount: round2(Number(r.editedAmount) || 0),
        description: r.description,
        period: r.period,
        feeVatPercent: Number(vatPercentByKey[FEE_VAT_KEY]) || 0,
        additionalLines: selectedDebts.map((d) => ({
          sourceType: d.kind,
          sourceId: d.id,
          vatPercent: Number(vatPercentByKey[debtKey(d)]) || 0,
        })),
        invoiceDescription: invoiceDescription.trim(),
        clientEmail: invoiceEmail.trim() || null,
        dueDate: invoiceDueDate || null,
      });
      setRows((prev) => prev.filter((x) => x.templateId !== r.templateId));
      setAttachingId(null);
      router.refresh();
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-fleet-brass bg-fleet-brass/10 p-3">
      <div className="text-lg font-bold text-fleet-brass">{t("mys_management_fee_reminder_title")}</div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const otherDebts = otherDebtsByBoatId[r.boatId] ?? [];
          const isAttaching = attachingId === r.templateId;
          const feeAmount = round2(Number(r.editedAmount) || 0);
          const selectedDebts = otherDebts.filter((d) => selectedDebtKeys.has(debtKey(d)));
          const subtotal = round2(feeAmount + selectedDebts.reduce((s, d) => s + d.amount, 0));
          const vatTotal = round2(
            feeAmount * ((Number(vatPercentByKey[FEE_VAT_KEY]) || 0) / 100) +
              selectedDebts.reduce((s, d) => s + d.amount * ((Number(vatPercentByKey[debtKey(d)]) || 0) / 100), 0)
          );

          return (
            <div key={r.templateId} className="flex flex-col gap-1.5 rounded-lg border border-fleet-border bg-white p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-fleet-navy">{r.boatName}</div>
                  <div className="truncate text-xs text-fleet-ink">{r.description}</div>
                </div>
                {editingAmountId === r.templateId ? (
                  <input
                    type="number"
                    step="0.01"
                    autoFocus
                    value={r.editedAmount}
                    onChange={(e) => updateEditedAmount(r.templateId, e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => confirmAmountEdit(r.templateId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmAmountEdit(r.templateId);
                      if (e.key === "Escape") cancelAmountEdit(r.templateId);
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    className={`w-24 shrink-0 ${INPUT_CLASS_COMPACT}`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingAmountId(r.templateId)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-fleet-border px-2 py-1 text-sm font-bold text-fleet-navy hover:bg-fleet-paper"
                  >
                    <span dir="ltr">{formatCurrency(feeAmount)}</span>
                    <Pencil size={12} className="text-fleet-ink" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={r.askingScope || confirmingId === r.templateId}
                  onClick={() => doAddOneToDebts(r)}
                  aria-label={t("mys_management_fee_add_to_debts_cta")}
                  title={t("mys_management_fee_add_to_debts_cta")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fleet-border text-fleet-moss-text hover:bg-fleet-paper disabled:opacity-50"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(r.templateId, r.period)}
                  aria-label={t("delete_word")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fleet-border text-fleet-ink hover:bg-fleet-paper"
                >
                  <X size={14} />
                </button>
              </div>

              {r.askingScope && (
                <div className="flex items-center gap-2 rounded-lg bg-fleet-brass/15 px-2.5 py-1.5 text-xs">
                  <span className="flex-1 text-fleet-navy">{t("mys_management_fee_scope_question")}</span>
                  <button
                    type="button"
                    onClick={() => resolveScope(r.templateId, "once")}
                    className="shrink-0 font-bold text-fleet-navy hover:underline"
                  >
                    {t("mys_management_fee_scope_once")}
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveScope(r.templateId, "permanent")}
                    className="shrink-0 font-bold text-fleet-teal hover:underline"
                  >
                    {t("mys_management_fee_scope_permanent")}
                  </button>
                </div>
              )}

              {otherDebts.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleAttach(r)}
                  className="flex w-fit items-center gap-1 text-xs font-bold text-fleet-teal hover:underline"
                >
                  {t("mys_attach_open_debts_cta", { count: otherDebts.length })}
                  {isAttaching ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}

              {isAttaching && (
                <div className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper p-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-fleet-navy">
                    <input
                      type="checkbox"
                      checked={selectedDebtKeys.size === otherDebts.length && otherDebts.length > 0}
                      onChange={() => toggleSelectAllDebts(otherDebts)}
                      className="h-4 w-4"
                    />
                    {t("select_all_word")}
                  </label>

                  <div className="flex flex-col gap-1">
                    {otherDebts.map((d) => (
                      <div key={debtKey(d)} className="flex flex-nowrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedDebtKeys.has(debtKey(d))}
                          onChange={() => toggleDebt(debtKey(d))}
                          className="h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1 truncate">{d.description}</div>
                        <div className="shrink-0 font-bold text-fleet-navy" dir="ltr">
                          {formatCurrency(d.amount)}
                        </div>
                        {selectedDebtKeys.has(debtKey(d)) && (
                          <div className="flex shrink-0 items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="0"
                              value={vatPercentByKey[debtKey(d)] ?? ""}
                              onChange={(e) => setVatPercentByKey((prev) => ({ ...prev, [debtKey(d)]: e.target.value }))}
                              onWheel={(e) => e.currentTarget.blur()}
                              aria-label={t("mys_vat_percent_label")}
                              className="w-14 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                            />
                            <span className="text-fleet-ink">%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-nowrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                    <div className="min-w-0 flex-1 truncate font-bold text-fleet-navy">{r.description}</div>
                    <div className="shrink-0 font-bold text-fleet-navy" dir="ltr">
                      {formatCurrency(feeAmount)}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="0"
                        value={vatPercentByKey[FEE_VAT_KEY] ?? ""}
                        onChange={(e) => setVatPercentByKey((prev) => ({ ...prev, [FEE_VAT_KEY]: e.target.value }))}
                        onWheel={(e) => e.currentTarget.blur()}
                        aria-label={t("mys_vat_percent_label")}
                        className="w-14 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
                      />
                      <span className="text-fleet-ink">%</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-fleet-ink">{t("description")}</label>
                    <input
                      value={invoiceDescription}
                      onChange={(e) => setInvoiceDescription(e.target.value)}
                      placeholder={t("mys_invoice_from_debts_description_placeholder")}
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
                      <input value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} type="email" className={INPUT_CLASS} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
                      <DateInput value={invoiceDueDate} onChange={setInvoiceDueDate} locale={locale} className={INPUT_CLASS} allowClear />
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5 rounded-lg bg-white px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
                      <span>{formatCurrency(vatTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-fleet-navy">
                      <span>{t("total")}</span>
                      <span>{formatCurrency(round2(subtotal + vatTotal))}</span>
                    </div>
                  </div>

                  {invoiceError && <p className="text-xs text-fleet-coral-text">{invoiceError}</p>}
                  <button
                    type="button"
                    disabled={generatingId === r.templateId}
                    onClick={() => generateInvoice(r)}
                    className={`flex items-center justify-center gap-1.5 ${PRIMARY_BUTTON_CLASS}`}
                  >
                    {generatingId === r.templateId ? t("saving_word") : t("mys_generate_invoice_cta")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-bold text-fleet-navy">
        <span>{t("total")}</span>
        <span dir="ltr">{formatCurrency(total)}</span>
      </div>

      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

      <button
        type="button"
        disabled={saving || hasPendingScopeChoice || confirmingId !== null}
        onClick={doAddToDebts}
        className={`flex items-center justify-center gap-1.5 ${PRIMARY_BUTTON_CLASS}`}
      >
        <Plus size={14} /> {saving ? t("saving_word") : t("mys_management_fee_add_to_debts_cta")}
      </button>
    </div>
  );
}
