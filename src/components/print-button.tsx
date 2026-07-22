"use client";

import { Printer } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export function PrintButton({ locale }: { locale: Locale }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-fleet-teal px-3.5 py-2 text-sm font-bold text-white hover:opacity-90"
    >
      <Printer size={16} /> {translate(locale, "export_print")}
    </button>
  );
}
