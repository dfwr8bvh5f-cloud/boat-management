"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import { Package, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import {
  createInventoryItem,
  createInventoryUploadUrl,
  updateInventoryItem,
  deleteInventoryItem,
  removeInventoryPhoto,
} from "@/lib/actions/boat-inventory";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { DateInput } from "@/components/date-input";
import { PhotoPickerButton } from "@/components/photo-picker-button";
import { PhotoThumb } from "@/components/photo-thumb";
import { RippleLoader } from "@/components/ripple-loader";
import { BOAT_INVENTORY_CATEGORIES, getBoatInventoryCategoryLabels } from "@/lib/labels";
import { MYS_COMPANY_INFO } from "@/lib/mys-company-info";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { useFileDrop } from "@/lib/use-file-drop";
import { createClient } from "@/lib/supabase/client";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { formatDateDisplay, todayLocalISO } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BoatInventoryCategory, BoatInventoryItem } from "@/lib/types/database";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SEARCH_INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

type InventoryItemWithUrl = BoatInventoryItem & { photoUrl: string | null };

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
  items: InventoryItemWithUrl[];
  canAdd: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getBoatInventoryCategoryLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InventoryItemWithUrl | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearchTerm = useDeferredValue(search.trim().toLowerCase());
  const filteredItems = useMemo(
    () => (deferredSearchTerm ? items.filter((i) => i.description.toLowerCase().includes(deferredSearchTerm)) : items),
    [items, deferredSearchTerm]
  );
  // No default - a real choice, same reasoning as technical_specs' own
  // category field (and expense_date/category elsewhere): forcing a
  // stand-in like "storage" hid a genuinely-undecided item.
  const [categoryValue, setCategoryValue] = useState<BoatInventoryCategory | "">("");
  const [categoryError, setCategoryError] = useState(false);
  const [quantityValue, setQuantityValue] = useState("1");
  const [dateValue, setDateValue] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Single reference photo per item - same signed-upload-URL pattern as
  // expenses-manager.tsx's own onPhotoFile, just one file instead of many.
  const [photoFile, setPhotoFile] = useState<{ path: string; name: string } | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);

  const resetPhotoState = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
  };

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    let compressed: File;
    try {
      compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    } catch (e) {
      setPhotoError(e instanceof HeicUnsupportedError ? t("heic_not_supported") : e instanceof Error ? e.message : String(e));
      return;
    }
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setPhotoError(t("scan_file_too_large"));
      return;
    }
    try {
      const { path, token } = await createInventoryUploadUrl(boatId, compressed.name);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("boat-inventory-photos").uploadToSignedUrl(path, token, compressed);
      if (uploadError) throw uploadError;
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoFile({ path, name: compressed.name });
      setPhotoPreviewUrl(URL.createObjectURL(compressed));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("upload_failed"));
    }
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop(onPhotoFile);

  const removeExistingPhoto = async () => {
    if (!editing) return;
    setRemovingPhoto(true);
    try {
      await removeInventoryPhoto(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, photoUrl: null, photo_path: null } : prev));
    } finally {
      setRemovingPhoto(false);
    }
  };

  const startNew = () => {
    setEditing(null);
    setCategoryValue("");
    setCategoryError(false);
    setQuantityValue("1");
    setDateValue(todayLocalISO());
    setSaveError(null);
    resetPhotoState();
    setShowForm((s) => (editing ? true : !s));
  };
  const startEdit = (item: InventoryItemWithUrl) => {
    setEditing(item);
    setCategoryValue(item.category);
    setCategoryError(false);
    setQuantityValue(String(item.quantity));
    setDateValue(item.entry_date);
    setSaveError(null);
    resetPhotoState();
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
    resetPhotoState();
  };

  const formAction = editing ? updateInventoryItem.bind(null, boatId, editing.id) : createInventoryItem.bind(null, boatId);

  const doSave = async (formData: FormData) => {
    setSaveError(null);
    setSaving(true);
    try {
      if (photoFile) formData.set("photo_path", photoFile.path);
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
      onSubmit={(e) => {
        e.preventDefault();
        if (!categoryValue) {
          setCategoryError(true);
          return;
        }
        doSave(new FormData(e.currentTarget));
      }}
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
            onChange={(v) => {
              setCategoryValue(v as BoatInventoryCategory);
              setCategoryError(false);
            }}
            options={BOAT_INVENTORY_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))}
            placeholder={t("choose_category")}
            emphasizeEmpty
            className={inputClass}
          />
          {categoryError && <p className="text-xs text-fleet-coral-text">{t("choose_category")}</p>}
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
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("date")}</label>
        <DateInput name="entry_date" value={dateValue} onChange={setDateValue} locale={locale} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("photo")}</label>
        <PhotoPickerButton
          onFile={(file) => void onPhotoFile(file)}
          dropHandlers={photoDropHandlers}
          dragging={photoDragging}
          label={t("add_product_photo")}
          cameraLabel={t("take_photo")}
          galleryLabel={t("upload_photo")}
        />
        {photoError && <p className="text-xs text-fleet-coral-text">{photoError}</p>}
        {photoPreviewUrl && <PhotoThumb src={photoPreviewUrl} onRemove={resetPhotoState} removeLabel={t("remove_word")} />}
        {!photoPreviewUrl && editing?.photoUrl && (
          <PhotoThumb src={editing.photoUrl} onRemove={removeExistingPhoto} removing={removingPhoto} removeLabel={t("remove_word")} />
        )}
      </div>
      {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
      <div className="flex gap-2">
        {/* Always shown (not just while editing) - this form has enough
            fields (description/category/quantity/date/photo) that the
            top toggle button that opens it can already be scrolled out of
            view by the time she reaches Save, with no other way to cancel
            from down here. */}
        <button type="button" onClick={closeForm} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
          {t("close_word")}
        </button>
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

  const itemRow = (item: InventoryItemWithUrl) =>
    editing?.id === item.id ? (
      <div key={item.id}>{renderForm()}</div>
    ) : (
      <div key={item.id} className="flex flex-nowrap items-center gap-1.5 rounded-xl border border-fleet-border bg-white p-3 sm:gap-3">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
            <Package size={16} className="text-fleet-brass" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{item.description}</div>
          <div className="truncate text-xs text-fleet-ink">
            {t("inv_quantity_label")}: {item.quantity} · <span dir="ltr">{formatDateDisplay(item.entry_date)}</span>
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
          <form action={deleteInventoryItem.bind(null, boatId, item.id, item.photo_path)}>
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
    items: filteredItems.filter((i) => i.category === category).sort((a, b) => a.description.localeCompare(b.description)),
  })).filter((g) => g.items.length > 0);
  // The printable sheet below is a full manifest - it must never reflect a
  // stray search query left in the box, so it's built from every item,
  // not the on-screen filtered groups above.
  const printGroups = BOAT_INVENTORY_CATEGORIES.map((category) => ({
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
              className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold text-fleet-paper transition-transform hover:opacity-90 active:scale-[0.97]"
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

      {items.length > 0 && (
        <div className="relative print:hidden">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fleet-ink" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_placeholder")}
            className={SEARCH_INPUT_CLASS}
          />
        </div>
      )}

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

        {printGroups.map((g) => (
          <div key={g.category} className="mb-5 break-inside-avoid">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-fleet-ink">{categoryLabels[g.category]}</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-fleet-paper">
                  <th className="border-b border-fleet-border px-2 py-1.5 text-start font-semibold text-fleet-ink">{t("description")}</th>
                  <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("inv_quantity_label")}</th>
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
