"use client";

import { useState } from "react";
import { Ruler, X } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { CloseSpecsEditProvider } from "@/components/specs-edit-context";
import type { Locale } from "@/lib/i18n/dictionaries";

// The edit form used to be nested inside the same narrow flex row as the
// MMSI link and toggle button (in the header), so when opened it was
// squeezed into that row's content width instead of spanning the card -
// lifting the open state up here lets the form render as a true full-width
// sibling of the header instead.
export function BoatSpecsCard({
  title,
  mmsiLink,
  specsContent,
  canEdit,
  locale,
  editContent,
}: {
  title: React.ReactNode;
  mmsiLink: React.ReactNode;
  specsContent: React.ReactNode;
  canEdit: boolean;
  locale: Locale;
  editContent: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy">{title}</div>
        <div className="flex items-center gap-3">
          {mmsiLink}
          {canEdit && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={translate(locale, "edit_specs")}
              className="rounded-md p-1.5 text-fleet-brass hover:bg-fleet-paper"
            >
              {open ? <X size={16} /> : <Ruler size={16} />}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-b border-dashed border-fleet-border pb-3">
          <CloseSpecsEditProvider value={() => setOpen(false)}>{editContent}</CloseSpecsEditProvider>
        </div>
      )}
      {specsContent}
    </div>
  );
}
