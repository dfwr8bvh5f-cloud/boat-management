"use client";

import { useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { formatDateDisplay } from "@/lib/date-format";
import { FloatingPanel } from "@/components/floating-panel";
import { CalendarPanel } from "@/components/calendar-panel";
import type { Locale } from "@/lib/i18n/dictionaries";

// A fully custom date picker, used instead of native <input type="date">
// everywhere in the app - the native picker always renders in the
// browser/OS language, ignoring our own language switcher, so it's the only
// way to keep the picker's month/weekday names in the language the user
// actually picked in the app. The popup itself (position, close behavior,
// calendar) is shared with DateRangeCalendar via FloatingPanel/CalendarPanel.
export function DateInput({
  name,
  defaultValue,
  value,
  onChange,
  locale,
  className,
  allowClear,
  placeholder,
  min,
  max,
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (iso: string) => void;
  locale: Locale;
  className?: string;
  allowClear?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setDate = (iso: string) => {
    if (!isControlled) setInternalValue(iso);
    onChange?.(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selected ?? ""} />}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 text-start disabled:opacity-60 ${
          className ?? "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal"
        }`}
      >
        <span className={selected ? "" : "text-fleet-ink/50"}>
          {selected ? <span dir="ltr">{formatDateDisplay(selected)}</span> : placeholder || t("select_date")}
        </span>
        <CalendarIcon size={14} className="shrink-0 text-fleet-ink" />
      </button>

      <FloatingPanel
        anchorRef={containerRef}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
      >
        <CalendarPanel
          locale={locale}
          selected={selected || undefined}
          onPick={setDate}
          min={min}
          max={max}
          onClear={allowClear ? () => setDate("") : undefined}
        />
      </FloatingPanel>
    </div>
  );
}
