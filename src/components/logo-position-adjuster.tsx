"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Lets management drag two sliders to choose which part of an uploaded
// logo shows through its frame, instead of always auto-centering - some
// logos have off-center artwork that auto-centering crops wrong.
export function LogoPositionAdjuster({
  imageUrl,
  x,
  y,
  onPositionChange,
  onRemove,
  frameClassName,
  locale,
}: {
  imageUrl: string;
  x: number;
  y: number;
  onPositionChange: (x: number, y: number) => Promise<void>;
  onRemove: () => Promise<void>;
  frameClassName: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pos, setPos] = useState({ x, y });
  const [removing, setRemoving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPos({ x, y }), [x, y]);

  const setAndSave = (next: { x: number; y: number }) => {
    setPos(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onPositionChange(next.x, next.y);
    }, 300);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-fit">
        <div className={`overflow-hidden bg-white ${frameClassName}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
          />
        </div>
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            await onRemove();
            setRemoving(false);
          }}
          aria-label="remove logo"
          className="absolute -end-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-fleet-coral text-white shadow disabled:opacity-60"
        >
          <X size={12} />
        </button>
      </div>
      <label className="flex flex-col gap-0.5 text-[11px] text-fleet-ink">
        {t("logo_position_x_label")}
        <input
          type="range"
          min={0}
          max={100}
          value={pos.x}
          onChange={(e) => setAndSave({ x: Number(e.target.value), y: pos.y })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-fleet-ink">
        {t("logo_position_y_label")}
        <input
          type="range"
          min={0}
          max={100}
          value={pos.y}
          onChange={(e) => setAndSave({ x: pos.x, y: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
