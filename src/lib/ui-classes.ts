// Shared class strings for the handful of primitives (text input, button)
// that were previously being re-typed - and drifting slightly - in every
// file that needed one. Import these instead of declaring a local
// `inputClass`/button className so every form field and action button
// looks and behaves the same regardless of which page it's on.

// The standard field style used across the app (white background, teal
// focus ring). Also styles the native `:user-invalid` state so a field
// left invalid after being touched gets a visible coral cue everywhere,
// not just in the one form that originally had it.
export const INPUT_CLASS =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15 [&:user-invalid]:border-fleet-coral [&:user-invalid]:ring-2 [&:user-invalid]:ring-fleet-coral/20";

// Same field style, shorter - for inline edit-in-place rows (e.g. a table
// row's own edit form) where a full-height field would blow out the row.
export const INPUT_CLASS_COMPACT =
  "h-8 rounded-lg border border-fleet-border bg-white px-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15 [&:user-invalid]:border-fleet-coral [&:user-invalid]:ring-2 [&:user-invalid]:ring-fleet-coral/20";

// Same field style again, tighter padding - for a single field sitting
// inline in a toolbar/row (a sort dropdown, a one-line user-row edit) where
// even the compact height/padding above is more than that spot has room for.
export const INPUT_CLASS_INLINE =
  "rounded-lg border border-fleet-border bg-white px-2 py-1.5 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export const PRIMARY_BUTTON_CLASS =
  "rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60";

export const SECONDARY_BUTTON_CLASS =
  "rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper";
