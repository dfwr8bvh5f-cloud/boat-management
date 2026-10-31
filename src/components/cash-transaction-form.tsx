"use client";

import { useState } from "react";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { CustomSelect } from "@/components/custom-select";
import { Button } from "@/components/ui/button";
import { createCashTransaction } from "@/lib/actions/cash";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { FORM_CARD_CLASS, INPUT_CLASS_COMPACT } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS_COMPACT;

export function CashTransactionForm({
  boatId,
  cashTxLabels,
  locale,
}: {
  boatId: string;
  cashTxLabels: { withdrawal: string; received: string };
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [formKey, setFormKey] = useState(0);
  const [typeValue, setTypeValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    // The native <select required> this used to be blocked submission
    // in-browser until a type was chosen - CustomSelect has no such
    // built-in enforcement (it's a plain hidden input under the hood), and
    // the server action defaults a missing type to "withdrawal" rather
    // than rejecting it, so without this a blank choice would silently
    // save as a withdrawal instead of stopping the submit.
    if (!formData.get("type")) {
      setSaveError(t("choose_tx_type"));
      return;
    }
    setSaving(true);
    try {
      const result = await createCashTransaction(boatId, formData);
      if (result?.error) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // `key={formKey}` below only resets the uncontrolled fields inside the
      // form - CustomSelect's value lives in this component's own state, so
      // it needs clearing here too or the type stays selected after save.
      setTypeValue("");
      setFormKey((k) => k + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      key={formKey}
      action={doSave}
      className={`${FORM_CARD_CLASS} print:hidden`}
    >
      <p className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
        {t("cash_bank_link")} {t("cash_bank_link_received")}
      </p>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("choose_tx_type")} *</label>
        <CustomSelect
          name="type"
          value={typeValue}
          onChange={setTypeValue}
          options={[
            { value: "withdrawal", label: cashTxLabels.withdrawal },
            { value: "received", label: cashTxLabels.received },
          ]}
          placeholder={t("choose_tx_type")}
          emphasizeEmpty
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fleet-ink">{t("amount")} *</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            onWheel={(e) => e.currentTarget.blur()}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fleet-ink">{t("date_word")}</label>
          <DateInput name="tx_date" locale={locale} className={inputClass} allowClear />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("note")}</label>
        <input name="notes" className={inputClass} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || saved} className="flex-1">
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : saved ? (
            <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
          ) : (
            t("save_transaction")
          )}
        </Button>
        {saveError && <div className="text-xs text-fleet-coral-text">{saveError}</div>}
      </div>
    </form>
  );
}
