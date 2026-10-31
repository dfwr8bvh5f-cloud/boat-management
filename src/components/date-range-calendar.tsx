"use client";

import { useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { formatDateDisplay } from "@/lib/date-format";
import { FloatingPanel } from "@/components/floating-panel";
import { CalendarPanel } from "@/components/calendar-panel";
import type { Locale } from "@/lib/i18n/dictionaries";

// A compact trigger button (like DateInput) that opens a small popover
// calendar for picking a trip's start and end date together: click the
// start day, then hovering later days shows a shaded preview of the range
// ("a shadow pulled to the end date"), and clicking again confirms the end
// and closes the popover. The popup itself is the same FloatingPanel +
// CalendarPanel DateInput uses, so both pickers look and behave alike.
export function DateRangeCalendar({
  startName,
  endName,
  defaultStart,
  defaultEnd,
  locale,
  onChange,
  min,
  max,
  required = true,
}: {
  startName: string;
  endName: string;
  defaultStart?: string;
  defaultEnd?: string;
  locale: Locale;
  onChange?: (start: string | null, end: string | null) => void;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const [start, setStart] = useState<string | null>(defaultStart ?? null);
  const [end, setEnd] = useState<string | null>(defaultEnd && defaultEnd !== defaultStart ? defaultEnd : null);
  const [showError, setShowError] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handlePick = (iso: string) => {
    setShowError(false);
    if (!start || end) {
      setStart(iso);
      setEnd(null);
      onChange?.(iso, null);
    } else if (iso < start) {
      setEnd(start);
      setStart(iso);
      closeAndRefocus();
      onChange?.(iso, start);
    } else {
      setEnd(iso);
      closeAndRefocus();
      onChange?.(start, iso);
    }
  };

  const clear = () => {
    setStart(null);
    setEnd(null);
    onChange?.(null, null);
  };

  const endValue = end ?? start ?? "";
  const displayText = start ? `${formatDateDisplay(start)} – ${formatDateDisplay(end ?? start)}` : "";

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <input type="hidden" name={startName} value={start ?? ""} />
      <input type="hidden" name={endName} value={endValue} />
      {required && (
        <input
          type="text"
          required
          value={start ?? ""}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            setShowError(true);
          }}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal ${
          showError && !start ? "border-fleet-coral ring-2 ring-fleet-coral/20" : "border-fleet-border"
        }`}
      >
        <span className={displayText ? "" : "text-fleet-ink/50"}>
          {displayText ? <span dir="ltr">{displayText}</span> : t("select_date_range")}
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
          range={{ start, end }}
          onPick={handlePick}
          min={min}
          max={max}
          onClear={!required && start ? clear : undefined}
          showSummary
        />
      </FloatingPanel>
      {showError && !start && <p className="text-xs text-fleet-coral-text">{t("booking_pick_dates_error")}</p>}
    </div>
  );
}
