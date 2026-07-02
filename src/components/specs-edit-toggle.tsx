"use client";

import { useState } from "react";
import { Ruler, X } from "lucide-react";

export function SpecsEditToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="ערוך מפרט"
        className="rounded-md p-1 text-fleet-brass hover:bg-fleet-paper"
      >
        {open ? <X size={15} /> : <Ruler size={15} />}
      </button>
      {open && <div className="mt-3 flex flex-col gap-3 border-t border-dashed border-fleet-border pt-3">{children}</div>}
    </>
  );
}
