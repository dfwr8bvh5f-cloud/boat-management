"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, Plus, Trash2, X } from "lucide-react";
import { uploadGalleryPhoto, deleteGalleryPhoto, setPrimaryBoatImage } from "@/lib/actions/boats";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { compressImageToLimit } from "@/lib/image-compress";
import { setInputFiles } from "@/lib/use-file-drop";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export type GalleryPhoto = { id: string; path: string; url: string };

export function BoatPhotoGallery({
  boatId,
  photos,
  primaryPath,
  canUpload,
  canManage,
  locale,
  trigger,
}: {
  boatId: string;
  photos: GalleryPhoto[];
  primaryPath: string | null;
  canUpload: boolean;
  canManage: boolean;
  locale: Locale;
  trigger: React.ReactNode;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [settingPrimaryPath, setSettingPrimaryPath] = useState<string | null>(null);
  const [savedPrimaryPath, setSavedPrimaryPath] = useState<string | null>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const galleryFormRef = useRef<HTMLFormElement>(null);
  const onGalleryFile = async (file: File | undefined) => {
    if (!file || !galleryFileRef.current || !galleryFormRef.current) return;
    const compressed = await compressImageToLimit(file, MAX_UPLOAD_FILE_BYTES);
    setInputFiles(galleryFileRef.current, compressed);
    galleryFormRef.current.requestSubmit();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("boat_gallery_title")} className="contents">
        {trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fleet-navy">{t("boat_gallery_title")}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close_word")}
                className="flex h-9 w-9 items-center justify-center text-fleet-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => {
                const isPrimary = p.path === primaryPath;
                return (
                  <div key={p.id} className="relative">
                    <div
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                        isPrimary ? "border-fleet-teal" : "border-fleet-border"
                      }`}
                    >
                      <Image src={p.url} alt="" fill sizes="(max-width: 640px) 33vw, 160px" unoptimized={false} className="object-cover" />
                    </div>
                    {isPrimary && (
                      <div className="absolute start-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-teal text-white">
                        <Check size={14} />
                      </div>
                    )}
                    {canManage && (
                      <div className="mt-1 flex items-center justify-between gap-1">
                        {!isPrimary && (
                          <form
                            action={async () => {
                              setSettingPrimaryPath(p.path);
                              await setPrimaryBoatImage(boatId, p.path);
                              setSettingPrimaryPath(null);
                              setSavedPrimaryPath(p.path);
                              setTimeout(() => setSavedPrimaryPath(null), 1500);
                            }}
                          >
                            <button
                              type="submit"
                              disabled={settingPrimaryPath === p.path || savedPrimaryPath === p.path}
                              className="flex items-center gap-1 py-1 text-3xs font-bold text-fleet-teal hover:underline disabled:opacity-60"
                            >
                              {settingPrimaryPath === p.path ? (
                                <RippleLoader size="sm" />
                              ) : savedPrimaryPath === p.path ? (
                                <span className="flex animate-pop-in items-center gap-1">
                                  <Check size={12} /> {t("saved_word")}
                                </span>
                              ) : (
                                t("set_primary_photo")
                              )}
                            </button>
                          </form>
                        )}
                        <form action={deleteGalleryPhoto.bind(null, boatId, p.id, p.path)} className="ms-auto">
                          <ConfirmSubmitButton
                            locale={locale}
                            confirmMessage={t("delete_photo_confirm")}
                            ariaLabel={t("delete_word")}
                            className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                          >
                            <Trash2 size={14} />
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}

              {canUpload && (
                <form ref={galleryFormRef} action={uploadGalleryPhoto.bind(null, boatId)} className="aspect-square">
                  <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-fleet-brass bg-fleet-paper text-fleet-brass">
                    <Plus size={16} />
                    <Camera size={14} />
                    <input
                      ref={galleryFileRef}
                      type="file"
                      name="photo"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onGalleryFile(e.target.files?.[0])}
                    />
                  </label>
                </form>
              )}
            </div>

            {photos.length === 0 && !canUpload && (
              <p className="py-4 text-center text-sm text-fleet-ink">{t("none_photos")}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
