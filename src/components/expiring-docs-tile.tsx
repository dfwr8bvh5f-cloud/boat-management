"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDateDisplay } from "@/lib/date-format";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { DocumentType } from "@/lib/types/database";

type ExpiringDoc = {
  id: string;
  name: string;
  docType: DocumentType;
  expiryDate: string;
  boatId: string;
  boatName: string;
};

// The fleet-wide "Expiring soon" count tile on /boats, made clickable - it
// used to just show a number with no way to see which documents it meant.
// `docs` is already filtered/sorted (soonest first) server-side.
export function ExpiringDocsTile({ docs, locale }: { docs: ExpiringDoc[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-xl border p-2 text-start hover:shadow-sm ${
          docs.length > 0 ? "border-fleet-coral bg-fleet-coral/5" : "border-fleet-border bg-white"
        }`}
      >
        <div className="flex items-center gap-1 text-3xs leading-tight text-fleet-ink">
          <FileText size={14} className="shrink-0" /> <span>{t("expiring_soon")}</span>
        </div>
        <div className={`mt-1 text-base font-bold ${docs.length > 0 ? "text-fleet-coral-text" : "text-fleet-moss-text"}`}>{docs.length}</div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-fleet-navy">{t("expiring_soon")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="rounded-lg p-1 text-fleet-ink hover:bg-fleet-paper">
                <X size={16} />
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-fleet-ink">{t("none_expiring_docs")}</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto">
                {docs.map((d) => (
                  <Link
                    key={d.id}
                    href={`/boats/${d.boatId}/documents`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-1 rounded-lg border border-fleet-border p-2.5 hover:bg-fleet-paper"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-fleet-navy">{d.boatName}</span>
                      <StatusBadge value={d.docType} locale={locale} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span dir="ltr" className="shrink-0 font-medium text-fleet-coral-text">
                        {formatDateDisplay(d.expiryDate)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
