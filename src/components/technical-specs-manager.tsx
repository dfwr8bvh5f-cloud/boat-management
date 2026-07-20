"use client";

import { useRef, useState } from "react";
import { Camera, Cog, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createTechnicalSpec,
  updateTechnicalSpec,
  deleteTechnicalSpec,
  approveTechnicalSpec,
  removeTechnicalSpecPhoto,
} from "@/lib/actions/technical-specs";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/custom-select";
import { TECHNICAL_SPEC_CATEGORIES, getTechnicalSpecCategoryLabels } from "@/lib/labels";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit } from "@/lib/image-compress";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { TechnicalSpec, TechnicalSpecCategory } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

type SpecWithUrl = TechnicalSpec & { photoUrl: string | null; operationHours: number | null };

export function TechnicalSpecsManager({
  boatId,
  specs,
  canAdd,
  isManagement,
  locale,
}: {
  boatId: string;
  specs: SpecWithUrl[];
  canAdd: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const categoryLabels = getTechnicalSpecCategoryLabels(locale);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SpecWithUrl | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPicked, setPhotoPicked] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [categoryValue, setCategoryValue] = useState<TechnicalSpecCategory | "">("");
  const [categoryError, setCategoryError] = useState(false);

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    const compressed = await compressImageToLimit(file, MAX_SCAN_FILE_BYTES);
    if (compressed.size > MAX_SCAN_FILE_BYTES) {
      setPhotoError(t("scan_file_too_large"));
      return;
    }
    if (photoRef.current) setInputFiles(photoRef.current, compressed);
    setPhotoPicked(true);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(URL.createObjectURL(compressed));
  };
  const { dragging: photoDragging, dropHandlers: photoDropHandlers } = useFileDrop((file) => {
    onPhotoFile(file);
  });
  const clearPhoto = () => {
    if (photoRef.current) photoRef.current.value = "";
    setPhotoPicked(false);
    setPhotoError(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
  };
  const removeExistingPhoto = async () => {
    if (!editing) return;
    setRemovingPhoto(true);
    try {
      await removeTechnicalSpecPhoto(boatId, editing.id);
      setEditing((prev) => (prev ? { ...prev, photoUrl: null, photo_path: null } : prev));
    } finally {
      setRemovingPhoto(false);
    }
  };

  const resetPhotoState = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPicked(false);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
  };

  const startEdit = (s: SpecWithUrl) => {
    setEditing(s);
    setCategoryValue(s.category);
    setCategoryError(false);
    resetPhotoState();
  };
  const startNew = () => {
    setEditing(null);
    setCategoryValue("");
    setCategoryError(false);
    resetPhotoState();
    setShowForm((s) => (editing ? true : !s));
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setCategoryValue("");
    setCategoryError(false);
    resetPhotoState();
  };

  const formAction = editing ? updateTechnicalSpec.bind(null, boatId, editing.id) : createTechnicalSpec.bind(null, boatId);

  const renderForm = () => (
    <form
      key={editing?.id ?? "new"}
      action={async (formData) => {
        if (!categoryValue) {
          setCategoryError(true);
          return;
        }
        await formAction(formData);
        closeForm();
      }}
      className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("category")}</label>
          <CustomSelect
            name="category"
            value={categoryValue}
            onChange={(v) => {
              setCategoryValue(v as TechnicalSpecCategory);
              setCategoryError(false);
            }}
            options={TECHNICAL_SPEC_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))}
            placeholder={t("choose_category")}
            emphasizeEmpty
            className={inputClass}
          />
          {categoryError && <p className="text-xs text-fleet-coral">{t("choose_category")}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("techspec_model")}</label>
          <input name="model" defaultValue={editing?.model ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("description")} *</label>
        <input name="name" required defaultValue={editing?.name} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("techspec_serial_number")}</label>
        <input name="serial_number" defaultValue={editing?.serial_number ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("details_word")}</label>
        <textarea name="details" rows={2} defaultValue={editing?.details ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-fleet-ink">{t("photo")}</label>
        <input
          ref={photoRef}
          type="file"
          name="photo"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPhotoFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            {...photoDropHandlers}
            className={`relative flex w-fit items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-fleet-navy ${
              photoDragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-brass bg-fleet-paper"
            }`}
          >
            <Camera size={15} /> {t("take_photo")}
            {photoDragging && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
                <Plus size={18} className="text-fleet-teal" />
              </span>
            )}
          </button>
          {photoPicked && (
            <button type="button" onClick={clearPhoto} className="text-xs font-medium text-fleet-ink hover:text-fleet-coral">
              {t("remove_word")}
            </button>
          )}
        </div>
        {photoError && <p className="text-xs text-fleet-coral">{photoError}</p>}
        {photoPreviewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreviewUrl} alt="" className="mt-1 max-h-24 w-fit rounded-lg border border-fleet-border" />
        )}
        {!photoPreviewUrl && editing?.photoUrl && (
          <div className="relative mt-1 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editing.photoUrl} alt="" className="max-h-24 rounded-lg border border-fleet-border" />
            <button
              type="button"
              onClick={removeExistingPhoto}
              disabled={removingPhoto}
              aria-label={t("remove_word")}
              className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
            >
              <X size={13} />
            </button>
          </div>
        )}
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
                {s.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photoUrl} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fleet-paper">
                    <Cog size={17} className="text-fleet-brass" />
                  </div>
                )}
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
                      s.operationHours != null ? `${t("techspec_next_service")}: ${s.operationHours}h` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {s.details && <div className="mt-0.5 text-xs text-fleet-ink">{s.details}</div>}
                </div>
                <ApprovalIndicator value={s.status} locale={locale} />
                {isManagement && s.status === "pending" && (
                  <form action={approveTechnicalSpec.bind(null, boatId, s.id)}>
                    <button type="submit" className="py-2 text-xs font-bold text-fleet-moss hover:underline">
                      {t("approve")}
                    </button>
                  </form>
                )}
                <div className="flex flex-col items-center gap-1.5">
                  {canAdd && (
                    <button
                      onClick={() => startEdit(s)}
                      aria-label="edit"
                      className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-navy"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {(canAdd || (isManagement && s.status === "pending")) && (
                    <form action={deleteTechnicalSpec.bind(null, boatId, s.id, s.photo_path)}>
                      <ConfirmSubmitButton
                        locale={locale}
                        confirmMessage={s.status === "pending" ? t("reject_spec_confirm") : t("delete_spec_confirm")}
                        ariaLabel={t("delete_word")}
                        className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral"
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
