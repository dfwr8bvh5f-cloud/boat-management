"use client";

import { useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const MIN_SCALE = 50;
const MAX_SCALE = 300;

// Lets management drag the logo directly to reposition it, and zoom in/out,
// instead of always auto-centering - some logos have off-center artwork or
// need to be bigger/smaller to look right inside the small frame.
export function LogoPositionAdjuster({
  imageUrl,
  x,
  y,
  scale,
  onPositionChange,
  onRemove,
  locale,
}: {
  imageUrl: string;
  x: number;
  y: number;
  scale: number;
  onPositionChange: (x: number, y: number, scale: number) => Promise<void>;
  onRemove: () => Promise<void>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pos, setPos] = useState({ x, y, scale });
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const setAndSave = (next: { x: number; y: number; scale: number }) => {
    setPos(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onPositionChange(next.x, next.y, next.scale);
    }, 300);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStart.current.px) / rect.width) * 100;
    const dyPct = ((e.clientY - dragStart.current.py) / rect.height) * 100;
    // Dragging the image right/down should reveal more of its left/top side,
    // which means object-position should decrease.
    setAndSave({
      x: clamp(dragStart.current.x - dxPct),
      y: clamp(dragStart.current.y - dyPct),
      scale: pos.scale,
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const changeScale = (delta: number) => {
    setAndSave({ x: pos.x, y: pos.y, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, pos.scale + delta)) });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative w-fit">
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`h-32 w-32 touch-none overflow-hidden rounded-lg bg-white ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
            style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.scale / 100})` }}
          />
        </div>
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            setError(null);
            try {
              await onRemove();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setRemoving(false);
            }
          }}
          aria-label="remove logo"
          className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-coral text-white shadow disabled:opacity-60"
        >
          <X size={13} />
        </button>
      </div>
      {error && <div className="max-w-40 text-[11px] text-fleet-coral">{error}</div>}
      <p className="max-w-40 text-[11px] text-fleet-ink">{t("logo_drag_hint")}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => changeScale(-10)}
          disabled={pos.scale <= MIN_SCALE}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-fleet-border bg-white text-fleet-navy disabled:opacity-40"
          aria-label="zoom out"
        >
          <Minus size={14} />
        </button>
        <span className="w-10 shrink-0 text-center text-[11px] text-fleet-ink">{Math.round(pos.scale)}%</span>
        <button
          type="button"
          onClick={() => changeScale(10)}
          disabled={pos.scale >= MAX_SCALE}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-fleet-border bg-white text-fleet-navy disabled:opacity-40"
          aria-label="zoom in"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
