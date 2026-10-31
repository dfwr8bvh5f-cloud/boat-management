"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import { Package, Pencil, Plus, Printer, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createInventoryItem,
  createInventoryUploadUrl,
  updateInventoryItem,
  deleteInventoryItem,
  removeInventoryPhoto,
  removeInventoryAttachmentPhoto,
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
import { INPUT_CLASS, SEARCH_INPUT_CLASS } from "@/lib/ui-classes";
import { ActionForm } from "@/components/action-form";

const inputClass = INPUT_CLASS;

type InventoryItemWithUrl = BoatInventoryItem & { photoUrl: string | null; photos: { id: string; path: string; url: string }[] };

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

  // One or more reference photos per item - same multi-file pending-array
  // pattern as expenses-manager.tsx's own photoFiles/onPhotoFile.
  const [photoFiles, setPhotoFiles] = useState<{ path: string; name: string }[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);

  const resetPhotoState = () => {
    photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setPhotoFiles([]);
    setPhotoPreviews([]);
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
      setPhotoFiles((prev) => [...prev, { path, name: compressed.name }]);
      setPhotoPreviews((prev) => [...prev, URL.createObjectURL(compressed)]);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t("upload_failed"));
    }
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop(onPhotoFile);

  const removePendingPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = async () => {
    if (!editing) return;
    setRemovingPhotoId("legacy");
    try {
      await removeInventoryPhoto(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, photoUrl: null, photo_path: null } : prev));
    } finally {
      setRemovingPhotoId(null);
    }
  };

  const removeExistingAttachmentPhoto = async (photo: { id: string; path: string }) => {
    if (!editing) return;
    setRemovingPhotoId(photo.id);
    try {
      await removeInventoryAttachmentPhoto(boatId, photo.id, photo.path);
      setEditing((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) } : prev));
    } finally {
      setRemovingPhotoId(null);
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
      photoFiles.forEach((f) => formData.append("photo_paths", f.path));
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
          done={photoFiles.length > 0}
          label={t("add_product_photo")}
          doneLabel={t("add_another_file")}
          cameraLabel={t("take_photo")}
          galleryLabel={t("upload_photo")}
        />
        {photoError && <p className="text-xs text-fleet-coral-text">{photoError}</p>}
        {(photoPreviews.length > 0 || editing?.photoUrl || (editing?.photos.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-start gap-2">
            {photoPreviews.map((url, i) => (
              <PhotoThumb key={`pending-${i}`} src={url} onRemove={() => removePendingPhoto(i)} removeLabel={t("remove_word")} />
            ))}
            {editing?.photoUrl && (
              <PhotoThumb
                src={editing.photoUrl}
                onRemove={removeExistingPhoto}
                removing={removingPhotoId === "legacy"}
                removeLabel={t("remove_word")}
              />
            )}
            {editing?.photos.map((p) => (
              <PhotoThumb
                key={p.id}
                src={p.url}
                onRemove={() => removeExistingAttachmentPhoto(p)}
                removing={removingPhotoId === p.id}
                removeLabel={t("remove_word")}
              />
            ))}
          </div>
        )}
      </div>
      {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
      <div className="flex gap-2">
        {/* Always shown (not just while editing) - this form has enough
            fields (description/category/quantity/date/photo) that the
            top toggle button that opens it can already be scrolled out of
            view by the time she reaches Save, with no other way to cancel
            from down here. */}
        <Button type="button" variant="secondary" className="flex-1" onClick={closeForm}>
          {t("close_word")}
        </Button>
        <Button type="submit" variant="primary" className="flex-1" disabled={saving || saved}>
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
        </Button>
      </div>
    </form>
  );

  const itemRow = (item: InventoryItemWithUrl) =>
    editing?.id === item.id ? (
      <div key={item.id}>{renderForm()}</div>
    ) : (
      <div key={item.id} className="flex flex-nowrap items-center gap-1.5 rounded-xl border border-fleet-border bg-white p-3 sm:gap-3">
        {(item.photoUrl ?? item.photos[0]?.url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl ?? item.photos[0].url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
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
            type="button"
            onClick={() => startEdit(item)}
            aria-label={t("edit_word")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-navy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
          >
            <Pencil size={16} />
          </button>
        )}
        {canAdd && (
          <ActionForm locale={locale} action={deleteInventoryItem.bind(null, boatId, item.id, item.photo_path)}>
            <ConfirmSubmitButton
              locale={locale}
              confirmMessage={t("delete_inventory_confirm")}
              destructive
              ariaLabel={t("delete_word")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-coral-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
            >
              <Trash2 size={16} />
            </ConfirmSubmitButton>
          </ActionForm>
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
            <Button type="button" variant="secondary" onClick={() => window.print()}>
              <Printer size={16} /> {t("export_print")}
            </Button>
          )}
          {canAdd && (
            <Button type="button" variant="primary" onClick={startNew}>
              {showForm ? (
                <>
                  <X size={14} /> {t("close_word")}
                </>
              ) : (
                <>
                  <Plus size={14} /> {t("add_inventory_item")}
                </>
              )}
            </Button>
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
                  <th className="w-10 border-b border-fleet-border px-2 py-1.5"></th>
                  <th className="border-b border-fleet-border px-2 py-1.5 text-start font-semibold text-fleet-ink">{t("description")}</th>
                  <th className="border-b border-fleet-border px-2 py-1.5 text-end font-semibold text-fleet-ink">{t("inv_quantity_label")}</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border-b border-dotted border-fleet-border px-2 py-1">
                      {(item.photoUrl ?? item.photos[0]?.url) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photoUrl ?? item.photos[0].url}
                          alt=""
                          className="h-8 w-8 rounded object-cover print:break-inside-avoid"
                        />
                      )}
                    </td>
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
