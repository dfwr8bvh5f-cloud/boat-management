"use client";

import { useRef, useState } from "react";
import { Camera, Cog, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createTechnicalSpec,
  updateTechnicalSpec,
  deleteTechnicalSpec,
  approveTechnicalSpec,
  removeTechnicalSpecPhoto,
} from "@/lib/actions/technical-specs";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { PhotoThumb } from "@/components/photo-thumb";
import { RippleLoader } from "@/components/ripple-loader";
import { UploadButton } from "@/components/upload-button";
import { CustomSelect } from "@/components/custom-select";
import { TECHNICAL_SPEC_CATEGORIES, getTechnicalSpecCategoryLabels } from "@/lib/labels";
import { useFileDrop, setInputFiles } from "@/lib/use-file-drop";
import { MAX_SCAN_FILE_BYTES } from "@/lib/upload";
import { compressImageToLimit, HeicUnsupportedError } from "@/lib/image-compress";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { TechnicalSpec, TechnicalSpecCategory } from "@/lib/types/database";
import { FORM_CARD_CLASS, INPUT_CLASS_COMPACT } from "@/lib/ui-classes";
import { ActionForm } from "@/components/action-form";

const inputClass = INPUT_CLASS_COMPACT;

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        setSaving(true);
        await formAction(formData);
        setSaving(false);
        setSaved(true);
        setTimeout(() => {
          setSaved(false);
          closeForm();
        }, 1400);
      }}
      className={FORM_CARD_CLASS}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("description")} *</label>
        <input name="name" required defaultValue={editing?.name} className={inputClass} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
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
          {categoryError && <p className="text-xs text-fleet-coral-text">{t("choose_category")}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fleet-ink">{t("techspec_model")}</label>
          <input name="model" defaultValue={editing?.model ?? ""} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fleet-ink">{t("techspec_serial_number")}</label>
          <input name="serial_number" defaultValue={editing?.serial_number ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("details_word")}</label>
        <textarea name="details" rows={2} defaultValue={editing?.details ?? ""} className={`${inputClass} h-auto resize-none py-1.5`} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fleet-ink">{t("photo")}</label>
        <input
          ref={photoRef}
          type="file"
          name="photo"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPhotoFile(e.target.files?.[0])}
        />
        <UploadButton
          onClick={() => photoRef.current?.click()}
          dropHandlers={photoDropHandlers}
          dragging={photoDragging}
          done={photoPicked}
          fullWidth={false}
          icon={<Camera size={16} />}
          label={t("take_photo")}
        />
        {photoError && <p className="text-xs text-fleet-coral-text">{photoError}</p>}
        {photoPreviewUrl && <PhotoThumb src={photoPreviewUrl} onRemove={clearPhoto} removeLabel={t("remove_word")} />}
        {!photoPreviewUrl && editing?.photoUrl && (
          <PhotoThumb src={editing.photoUrl} onRemove={removeExistingPhoto} removing={removingPhoto} removeLabel={t("remove_word")} />
        )}
      </div>
      <div className="flex gap-2">
        {/* Always shown (not just while editing) - the top toggle button
            that opened this form can already be scrolled out of view by
            the time she reaches Save. */}
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
            t("add_spec")
          )}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-4">
      {canAdd && (
        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={startNew}>
            <Plus size={16} /> {showForm ? t("close_word") : t("add_spec")}
          </Button>
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
                    <Cog size={16} className="text-fleet-brass" />
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
                  <ActionForm locale={locale} action={approveTechnicalSpec.bind(null, boatId, s.id)}>
                    <button type="submit" className="py-2 text-xs font-bold text-fleet-moss-text hover:underline">
                      {t("approve")}
                    </button>
                  </ActionForm>
                )}
                <div className="flex flex-col items-center gap-1.5">
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      aria-label={t("edit_word")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-navy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {(canAdd || (isManagement && s.status === "pending")) && (
                    <ActionForm locale={locale} action={deleteTechnicalSpec.bind(null, boatId, s.id, s.photo_path)}>
                      <ConfirmSubmitButton
                        locale={locale}
                        confirmMessage={s.status === "pending" ? t("reject_spec_confirm") : t("delete_spec_confirm")}
                        destructive
                        ariaLabel={t("delete_word")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink transition-transform hover:bg-fleet-paper hover:text-fleet-coral-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 focus-visible:ring-offset-1"
                      >
                        <Trash2 size={16} />
                      </ConfirmSubmitButton>
                    </ActionForm>
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
