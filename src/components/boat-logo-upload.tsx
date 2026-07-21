"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Plus, Ship, X } from "lucide-react";
import { autoCropToContent } from "@/lib/image-crop";
import { useFileDrop } from "@/lib/use-file-drop";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Auto-crops the logo to its actual content before upload (see image-crop.ts)
// and displays it with object-contain, so the whole mark always shows -
// no manual position/zoom controls needed, and nothing gets cropped off.
export function BoatLogoUpload({
  logoUrl,
  onUpload,
  onRemove,
  locale,
  label,
}: {
  logoUrl: string | null;
  onUpload: (formData: FormData) => Promise<void>;
  onRemove: () => Promise<void>;
  locale: Locale;
  label?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const cropped = await autoCropToContent(file);
      const formData = new FormData();
      formData.set("logo", cropped);
      await onUpload(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const { dragging, dropHandlers } = useFileDrop(handleFile);

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRemove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        {...dropHandlers}
        className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white ${
          dragging ? "border-fleet-teal bg-fleet-teal/10" : "border-fleet-border"
        }`}
      >
        {logoUrl ? (
          <Image src={logoUrl} alt="" fill sizes="64px" unoptimized={false} className="object-contain" />
        ) : (
          <Ship size={22} className="text-fleet-brass" />
        )}
        {dragging && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-fleet-teal/20">
            <Plus size={20} className="text-fleet-teal" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="w-fit cursor-pointer rounded-lg border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper">
          {busy ? t("uploading_word") : (label ?? t("boat_logo"))}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        {logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={handleRemove}
            className="flex items-center gap-1 text-2xs font-medium text-fleet-coral-text hover:underline disabled:opacity-60"
          >
            <X size={14} /> {t("remove_word")}
          </button>
        )}
        {saved && <div className="text-2xs text-fleet-moss">{t("saved_word")}</div>}
        {error && <div className="max-w-56 text-2xs text-fleet-coral-text">{error}</div>}
      </div>
    </div>
  );
}
