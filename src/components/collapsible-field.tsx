"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// A secondary/optional field (notes, an extra charge, an internal comment)
// that would otherwise always take up a row even when empty. Renders a
// small "+ <label>" link until clicked; opens immediately - with no link
// shown at all - when the field already holds a value, so existing data is
// never hidden behind an extra click. Pulled out of the Salaries edit form
// (the "+ Add note" field) so every other form that needs the same
// disclosure behavior reuses it instead of re-implementing the open/closed
// state and the two class strings by hand.
export function CollapsibleField({
  label,
  hasValue,
  children,
}: {
  label: string;
  hasValue: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(hasValue);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1 text-xs font-medium text-fleet-teal underline"
      >
        + {label}
      </button>
    );
  }

  return <>{children}</>;
}
