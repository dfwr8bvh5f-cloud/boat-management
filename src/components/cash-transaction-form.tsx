"use client";

import { useState } from "react";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { createCashTransaction } from "@/lib/actions/cash";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      await createCashTransaction(boatId, formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
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
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 print:hidden"
    >
      <p className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
        {t("cash_bank_link")} {t("cash_bank_link_received")}
      </p>
      <select name="type" defaultValue="" required aria-label={t("choose_tx_type")} className={inputClass}>
        <option value="" disabled>{t("choose_tx_type")}</option>
        <option value="withdrawal">{cashTxLabels.withdrawal}</option>
        <option value="received">{cashTxLabels.received}</option>
      </select>
      <div className="grid grid-cols-2 gap-3">
        <input name="amount" type="number" step="0.01" required placeholder={`${t("amount")} *`} className={inputClass} />
        <DateInput name="tx_date" locale={locale} className={inputClass} allowClear />
      </div>
      <input name="notes" placeholder={t("note")} className={inputClass} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || saved}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : saved ? (
            <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
          ) : (
            t("save_transaction")
          )}
        </button>
        {saveError && <div className="text-xs text-fleet-coral-text">{saveError}</div>}
      </div>
    </form>
  );
}
