"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-fleet-teal px-3.5 py-2 text-sm font-bold text-white hover:opacity-90"
    >
      <Printer size={15} /> הדפס / שמור כ-PDF
    </button>
  );
}
