"use client";

import { useRef, useState } from "react";
import { Ship, X } from "lucide-react";
import { autoCropToContent } from "@/lib/image-crop";
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
}: {
  logoUrl: string | null;
  onUpload: (formData: FormData) => Promise<void>;
  onRemove: () => Promise<void>;
  locale: Locale;
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
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-fleet-border bg-white">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <Ship size={22} className="text-fleet-brass" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="w-fit cursor-pointer rounded-lg border border-fleet-border bg-white px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper">
          {busy ? t("uploading_word") : t("boat_logo")}
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
            className="flex items-center gap-1 text-[11px] font-medium text-fleet-coral hover:underline disabled:opacity-60"
          >
            <X size={11} /> {t("remove_word")}
          </button>
        )}
        {saved && <div className="text-[11px] text-fleet-moss">{t("saved_word")}</div>}
        {error && <div className="max-w-56 text-[11px] text-fleet-coral">{error}</div>}
      </div>
    </div>
  );
}
