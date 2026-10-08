"use client";

import { useState } from "react";
import Image from "next/image";
import { Package, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { createInventoryItem, updateInventoryItem, deleteInventoryItem } from "@/lib/actions/boat-inventory";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { RippleLoader } from "@/components/ripple-loader";
import { BOAT_INVENTORY_CATEGORIES, getBoatInventoryCategoryLabels } from "@/lib/labels";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatInventoryCategory, BoatInventoryItem } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

export function BoatInventoryManager({
  boatId,
  boatName,
  boatLogoUrl,
  items,
  canAdd,
  locale,
}: {
  boatId: string;
  boatName: string;
  boatLogoUrl: string | null;
  items: BoatInventoryItem[];
  canAdd: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getBoatInventoryCategoryLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BoatInventoryItem | null>(null);
  const [categoryValue, setCategoryValue] = useState<BoatInventoryCategory>("storage");
  const [quantityValue, setQuantityValue] = useState("1");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startNew = () => {
    setEditing(null);
    setCategoryValue("storage");
    setQuantityValue("1");
    setSaveError(null);
    setShowForm((s) => (editing ? true : !s));
  };
  const startEdit = (item: BoatInventoryItem) => {
    setEditing(item);
    setCategoryValue(item.category);
    setQuantityValue(String(item.quantity));
    setSaveError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  };

  const formAction = editing ? updateInventoryItem.bind(null, boatId, editing.id) : createInventoryItem.bind(null, boatId);

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      await formAction(formData);
      setSaving(false);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        closeForm();
      }, 1400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
      setSaving(false);
    }
  };

  const renderForm = () => (
    <form
      key={editing?.id ?? "new"}
      action={doSave}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")} *</label>
        <input name="description" required defaultValue={editing?.description} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <CustomSelect
            name="category"
            value={categoryValue}
            onChange={(v) => setCategoryValue(v as BoatInventoryCategory)}
            options={BOAT_INVENTORY_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("inv_quantity_label")} *</label>
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            required
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={inputClass}
          />
        </div>
      </div>
      {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
      <div className="flex gap-2">
        {editing && (
          <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
            {t("close_word")}
          </button>
        )}
        <button
          type="submit"
          disabled={saving || saved}
          className={`flex flex-1 items-center justify-center gap-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          {saving ? (
            <>
              <RippleLoader size="sm" /> {t("saving_word")}
            </>
          ) : saved ? (
            <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
          ) : editing ? (
            t("save_edit")
          ) : (
            t("add_inventory_item")
          )}
        </button>
      </div>
    </form>
  );

  const itemRow = (item: BoatInventoryItem) =>
    editing?.id === item.id ? (
      <div key={item.id}>{renderForm()}</div>
    ) : (
      <div key={item.id} className="flex flex-nowrap items-center gap-1.5 rounded-xl border border-fleet-border bg-white p-3 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{item.description}</div>
          <div className="truncate text-xs text-fleet-ink">
            {t("inv_quantity_label")}: {item.quantity}
          </div>
        </div>
        {canAdd && (
          <button
            onClick={() => startEdit(item)}
            aria-label="edit"
            className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-ink hover:text-fleet-navy"
          >
            <Pencil size={16} />
          </button>
        )}
        {canAdd && (
          <form action={deleteInventoryItem.bind(null, boatId, item.id)}>
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={t("delete_inventory_confirm")}
              ariaLabel={t("delete_word")}
              className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
            >
              <Trash2 size={16} />
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    );

  // Fixed category order (BOAT_INVENTORY_CATEGORIES), each group sorted
  // alphabetically by description - an inventory sheet is read top-to-bottom
  // for "is X aboard", not chronologically, so creation order isn't useful
  // here the way it is for most other lists in this app.
  const groups = BOAT_INVENTORY_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category).sort((a, b) => a.description.localeCompare(b.description)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("inv_title")}</h1>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3.5 py-2 text-sm font-bold text-fleet-navy hover:bg-fleet-paper"
            >
              <Printer size={16} /> {t("export_print")}
            </button>
          )}
          {canAdd && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper hover:opacity-90"
            >
              {showForm ? (
                <span className="inline-flex items-center gap-1">
                  <X size={14} /> {t("close_word")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} /> {t("add_inventory_item")}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {showForm && canAdd && !editing && <div className="print:hidden">{renderForm()}</div>}

      <div className="flex flex-col gap-4 print:hidden">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
            {t("none_inventory")}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fleet-ink">
                <Package size={14} className="text-fleet-brass" /> {categoryLabels[g.category]}
              </div>
              {g.items.map(itemRow)}
            </div>
          ))
        )}
      </div>

      {/* Printable document - hidden on screen, shown only via window.print()
          above. Both logos side by side + a fixed title, same convention as
          the MYS boat Statement page (mys/debts/statement/[boatId]/page.tsx),
          just with two logos instead of a fallback between them, per her
          explicit ask. */}
      <div dir="ltr" className="hidden print:block">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {boatLogoUrl && (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                <Image src={boatLogoUrl} alt="" fill sizes="56px" className="object-contain" />
              </div>
            )}
            <div className="relative h-14 w-14 shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mys-logo.png" alt="" className="h-14 w-14 object-contain" />
            </div>
            <div>
              <div className="font-bold">{MYS_COMPANY_INFO.name}</div>
              <div className="text-xs text-fleet-ink">{MYS_COMPANY_INFO.tagline}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-lg font-bold">{t("inv_pdf_subtitle")}</div>
            <div className="text-xs text-fleet-ink">{boatName}</div>
            <div className="text-xs text-fleet-ink">{formatDateDisplay(todayLocalISO())}</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.category} className="mb-5 break-inside-avoid">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-fleet-ink">{categoryLabels[g.category]}</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-fleet-paper">
                  <th className="border-b border-fleet-border px-2 py-1.5 text-start">{t("description")}</th>
                  <th className="border-b border-fleet-border px-2 py-1.5 text-end">{t("inv_quantity_label")}</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1">{item.description}</td>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1 text-end">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
