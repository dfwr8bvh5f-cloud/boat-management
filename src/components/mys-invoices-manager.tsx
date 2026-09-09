"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createMysInvoice, markMysInvoiceSent, markMysInvoicePaid, voidMysInvoice } from "@/lib/actions/mys";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysInvoice, MysInvoiceStatus } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const STATUS_CLASSES: Record<MysInvoiceStatus, string> = {
  draft: "bg-fleet-paper text-fleet-ink",
  sent: "bg-fleet-brass/15 text-fleet-brass",
  paid: "bg-fleet-moss/15 text-fleet-moss-text",
  void: "bg-fleet-coral/15 text-fleet-coral-text",
};

export function MysInvoicesManager({
  invoices,
  boats,
  locale,
}: {
  invoices: MysInvoice[];
  boats: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const statusLabels: Record<MysInvoiceStatus, string> = {
    draft: t("mys_invoice_status_draft"),
    sent: t("mys_invoice_status_sent"),
    paid: t("mys_invoice_status_paid"),
    void: t("mys_invoice_status_void"),
  };

  const [showForm, setShowForm] = useState(false);
  const [boatId, setBoatId] = useState("");
  const [clientName, setClientName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const closeForm = () => {
    setShowForm(false);
    setBoatId("");
    setClientName("");
    setDueDate("");
    setSaveError(null);
  };

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      await createMysInvoice(formData);
      closeForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("mys_invoices_title")}</h1>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
        >
          {showForm ? (
            <span className="inline-flex items-center gap-1">
              <X size={14} /> {t("close_word")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Plus size={14} /> {t("mys_add_invoice")}
            </span>
          )}
        </button>
      </div>

      {showForm && (
        <form action={doSave} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_boat")}</label>
            <CustomSelect
              name="boat_id"
              value={boatId}
              onChange={(v) => {
                setBoatId(v);
                const boat = boats.find((b) => b.id === v);
                if (boat) setClientName(boat.name);
              }}
              options={[{ value: "", label: t("mys_invoice_free_client") }, ...boats.map((b) => ({ value: b.id, label: b.name }))]}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_ad_hoc_client_name")} *</label>
            <input name="client_name" required value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
            <input name="client_email" type="email" className={INPUT_CLASS} />
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
              <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
              <DateInput name="due_date" value={dueDate} onChange={setDueDate} locale={locale} className={INPUT_CLASS} allowClear />
            </div>
          </div>
          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
              {t("close_word")}
            </button>
            <button type="submit" disabled={saving} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
              {saving ? t("saving_word") : t("mys_add_invoice")}
            </button>
          </div>
        </form>
      )}

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("mys_no_invoices")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex flex-nowrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <span dir="ltr">{inv.invoice_number}</span> · {inv.client_name}
                </div>
                <div className="truncate text-xs text-fleet-ink">
                  {inv.description}
                  {" · "}
                  <span dir="ltr">{formatDateDisplay(inv.issued_date)}</span>
                  {inv.due_date && (
                    <>
                      {" · "}
                      {t("mys_invoice_due_date")}: <span dir="ltr">{formatDateDisplay(inv.due_date)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-2xs font-bold ${STATUS_CLASSES[inv.status]}`}>
                {statusLabels[inv.status]}
              </span>
              <div className="shrink-0 text-sm font-bold text-fleet-navy">{formatCurrency(inv.amount)}</div>
              {inv.status === "draft" && (
                <form action={markMysInvoiceSent.bind(null, inv.id)}>
                  <button type="submit" className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper">
                    {t("mys_mark_sent")}
                  </button>
                </form>
              )}
              {inv.status === "sent" && (
                <form action={markMysInvoicePaid.bind(null, inv.id)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("mys_settle_charge_confirm")}
                    className="rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                  >
                    {t("mys_mark_settled")}
                  </ConfirmSubmitButton>
                </form>
              )}
              {(inv.status === "draft" || inv.status === "sent") && (
                <form action={voidMysInvoice.bind(null, inv.id)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("mys_void_invoice_confirm")}
                    ariaLabel={t("mys_void_invoice")}
                    className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                  >
                    <X size={14} />
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
