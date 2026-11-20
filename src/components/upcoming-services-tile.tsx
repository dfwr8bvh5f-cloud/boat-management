"use client";

import { useState } from "react";
import Link from "next/link";
import { Gauge, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { UpcomingService } from "@/lib/fleet-upcoming-services";

// Fleet-wide "Upcoming services" count tile on /boats (same pattern as the
// expiring-documents tile): machines whose latest captain-reported hours put
// the next 250h service within the warning window. Clicking lists them.
export function UpcomingServicesTile({ items, locale }: { items: UpcomingService[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-xl border p-2 text-start hover:shadow-sm ${
          items.length > 0 ? "border-fleet-brass bg-fleet-highlight" : "border-fleet-border bg-white"
        }`}
      >
        <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
          <Gauge size={14} className="shrink-0" /> <span>{t("upcoming_services")}</span>
        </div>
        <div className={`mt-1 text-base font-bold ${items.length > 0 ? "text-fleet-brass" : "text-fleet-moss-text"}`}>{items.length}</div>
      </button>

      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-fleet-navy">{t("upcoming_services")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="rounded-lg p-1 text-fleet-ink hover:bg-fleet-paper">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-fleet-ink">{t("upcoming_services_hint")}</p>
            {items.length === 0 ? (
              <p className="text-sm text-fleet-ink">{t("none_upcoming_services")}</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto">
                {items.map((i) => (
                  <Link
                    key={i.specId}
                    href={`/boats/${i.boatId}/maintenance/reports`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-1 rounded-lg border border-fleet-border p-2.5 hover:bg-fleet-paper"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-fleet-navy">{i.boatName}</span>
                      <span className="shrink-0 text-xs font-semibold text-fleet-brass">
                        {i.remaining === 0 ? t("weekly_service_due_short") : t("weekly_service_in_hours", { hours: i.remaining })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                      <span className="min-w-0 flex-1 truncate">{i.machineName}</span>
                      <span dir="ltr" className="shrink-0">
                        {i.hours}h · {formatDateDisplay(i.weekOf)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
