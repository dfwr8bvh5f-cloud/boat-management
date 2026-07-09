"use client";

import { useState } from "react";
import type { Boat } from "@/lib/types/database";

// A boat's status keeps 3 possible values in the database (active/
// maintenance/inactive - old records display correctly everywhere else),
// but this control only ever sets it to one of two: clicking flips between
// "active" and "inactive". A boat that's currently "maintenance" starts the
// switch in the off/red position without silently rewriting its status the
// next time an unrelated field on this form is auto-saved - only an actual
// click changes the value.
export function BoatStatusToggle({
  initialStatus,
  disabled,
  activeLabel,
  inactiveLabel,
}: {
  initialStatus: Boat["status"];
  disabled?: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const [status, setStatus] = useState<string>(initialStatus);
  const active = status === "active";

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name="status" value={status} />
      <button
        type="button"
        role="switch"
        aria-checked={active}
        dir="ltr"
        disabled={disabled}
        onClick={() => setStatus(active ? "inactive" : "active")}
        title={active ? activeLabel : inactiveLabel}
        aria-label={active ? activeLabel : inactiveLabel}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          active ? "bg-fleet-moss" : "bg-fleet-coral"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            active ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className={`text-sm font-bold ${active ? "text-fleet-moss" : "text-fleet-coral"}`}>
        {active ? activeLabel : inactiveLabel}
      </span>
    </div>
  );
}
