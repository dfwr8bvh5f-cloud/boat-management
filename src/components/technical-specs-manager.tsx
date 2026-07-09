"use client";

import { useRef, useState } from "react";
import { Camera, Cog, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  createTechnicalSpec,
  updateTechnicalSpec,
  deleteTechnicalSpec,
  approveTechnicalSpec,
} from "@/lib/actions/technical-specs";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { TECHNICAL_SPEC_CATEGORIES, getTechnicalSpecCategoryLabels } from "@/lib/labels";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { TechnicalSpec, TechnicalSpecCategory } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

type ScanResult = {
  name?: string | null;
  model?: string | null;
  serial_number?: string | null;
  category?: string | null;
};

export function TechnicalSpecsManager({
  boatId,
  specs,
  canAdd,
  isManagement,
  locale,
}: {
  boatId: string;
  specs: TechnicalSpec[];
  canAdd: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getTechnicalSpecCategoryLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TechnicalSpec | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const serialRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);

  const startEdit = (s: TechnicalSpec) => {
    setEditing(s);
    setScanMsg(null);
  };
  const startNew = () => {
    setEditing(null);
    setScanMsg(null);
    setShowForm((s) => (editing ? true : !s));
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setScanMsg(null);
  };

  const formAction = editing ? updateTechnicalSpec.bind(null, boatId, editing.id) : createTechnicalSpec.bind(null, boatId);

  const onScanFile = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/scan-technical-spec", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScanOk(false);
        setScanMsg(data.error ?? t("scan_fail"));
        return;
      }
      const result: ScanResult = data.result ?? {};
      if (result.name && nameRef.current) nameRef.current.value = result.name;
      if (result.model && modelRef.current) modelRef.current.value = result.model;
      if (result.serial_number && serialRef.current) serialRef.current.value = result.serial_number;
      if (
        result.category &&
        categoryRef.current &&
        TECHNICAL_SPEC_CATEGORIES.includes(result.category as TechnicalSpecCategory)
      ) {
        categoryRef.current.value = result.category;
      }
      setScanOk(true);
      setScanMsg(t("scan_ok"));
    } catch {
      setScanOk(false);
      setScanMsg(t("scan_connect_fail"));
    } finally {
      setScanning(false);
    }
  };

  const renderForm = () => (
    <form
      key={editing?.id ?? "new"}
      action={async (formData) => {
        await formAction(formData);
        closeForm();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <input ref={scanRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onScanFile(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => scanRef.current?.click()}
        disabled={scanning}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-fleet-brass bg-fleet-paper px-3 py-2 text-sm text-fleet-navy disabled:opacity-60"
      >
        {scanning ? <Sparkles size={15} className="animate-twinkle" /> : <Camera size={15} />}{" "}
        {scanning ? t("scanning") : t("techspec_scan_photo")}
      </button>
      {scanMsg && (
        <div className={`flex items-center gap-1 text-xs ${scanOk ? "text-fleet-moss" : "text-fleet-coral"}`}>
          <Sparkles size={12} /> {scanMsg}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <select ref={categoryRef} name="category" defaultValue={editing?.category ?? "engine"} className={inputClass}>
            {TECHNICAL_SPEC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("techspec_model")}</label>
          <input ref={modelRef} name="model" defaultValue={editing?.model ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")} *</label>
        <input ref={nameRef} name="name" required defaultValue={editing?.name} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("techspec_serial_number")}</label>
        <input ref={serialRef} name="serial_number" defaultValue={editing?.serial_number ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("techspec_next_service")}</label>
        <DateInput name="next_service_date" defaultValue={editing?.next_service_date ?? ""} locale={locale} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("details_word")}</label>
        <textarea name="details" rows={2} defaultValue={editing?.details ?? ""} className={inputClass} />
      </div>
      <div className="flex gap-2">
        {editing && (
          <button
            type="button"
            onClick={closeForm}
            className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
          >
            {t("close_word")}
          </button>
        )}
        <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
          {editing ? t("save_edit") : t("add_spec")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      {canAdd && (
        <div className="flex justify-end">
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
          >
            <Plus size={15} /> {showForm ? t("close_word") : t("add_spec")}
          </button>
        </div>
      )}

      {showForm && canAdd && !editing && renderForm()}

      {specs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_specs")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {specs.map((s) =>
            editing?.id === s.id ? (
              <div key={s.id}>{renderForm()}</div>
            ) : (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                  <Cog size={17} className="text-fleet-brass" />
                </div>
                <div className="min-w-[140px] flex-1">
                  <div className="text-sm font-semibold">
                    {s.name}
                    {s.quantity != null ? ` × ${s.quantity}` : ""}
                  </div>
                  <div className="text-xs text-fleet-ink">
                    {[
                      categoryLabels[s.category],
                      s.model,
                      s.serial_number ? `SN ${s.serial_number}` : null,
                      s.next_service_date ? `${t("techspec_next_service")}: ${formatDateDisplay(s.next_service_date)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {s.details && <div className="mt-0.5 text-xs text-fleet-ink">{s.details}</div>}
                </div>
                <ApprovalIndicator value={s.status} locale={locale} />
                {isManagement && s.status === "pending" && (
                  <form action={approveTechnicalSpec.bind(null, boatId, s.id)}>
                    <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                      {t("approve")}
                    </button>
                  </form>
                )}
                <div className="flex flex-col items-center gap-1.5">
                  {canAdd && (
                    <button onClick={() => startEdit(s)} aria-label="edit" className="text-fleet-ink hover:text-fleet-navy">
                      <Pencil size={16} />
                    </button>
                  )}
                  {(canAdd || (isManagement && s.status === "pending")) && (
                    <form action={deleteTechnicalSpec.bind(null, boatId, s.id)}>
                      <ConfirmSubmitButton
                        confirmMessage={s.status === "pending" ? t("reject_spec_confirm") : t("delete_spec_confirm")}
                        className="text-fleet-ink hover:text-fleet-coral"
                      >
                        <Trash2 size={16} />
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
