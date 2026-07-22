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

// Emphasis convention (design-system audit finding: font-bold was used 271
// times vs font-semibold's 57 with no visible rule for which applied where).
// New code should follow this split rather than picking whichever looks
// right in the moment:
//   font-bold      - primary buttons, financial totals/balances, page and
//                     section titles, anything the eye should land on first.
//   font-semibold  - card/table headers, secondary labels, inline action
//                     links (e.g. "update", "edit") - present but secondary.
// Not retrofitted across all ~300 existing call sites in this pass - that
// would mean re-judging each one individually to avoid flipping a spot where
// the "wrong" weight was actually a deliberate choice, which is a separate,
// larger review than this design-token pass.
