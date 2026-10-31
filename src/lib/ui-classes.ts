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

// The page-level free-text search box (icon inset at the start, via ps-9) -
// was independently retyped identically in 6 manager files before being
// pulled out here.
export const SEARCH_INPUT_CLASS =
  "w-full rounded-lg border border-fleet-border bg-white py-2 ps-9 pe-3 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

// active:scale-* + transition-transform gives every button a small, cheap
// "press" cue (the standard iOS/Android tap-feedback pattern) instead of
// state changing with no physical feeling of a press at all.
export const PRIMARY_BUTTON_CLASS =
  "rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white transition-transform hover:opacity-90 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100";

export const SECONDARY_BUTTON_CLASS =
  "rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink transition-transform hover:bg-fleet-paper active:scale-[0.97]";

// A single-entity add/edit card (one row's own inline edit form, a compact
// modal body) - centers the card and caps it well short of the page's full
// width, since a form with a handful of fields stretched edge-to-edge on a
// wide desktop screen leaves fields like amount/date absurdly wide and
// drags the eye across the whole screen between a label and its value.
// This is the single "how wide should this card be" default; a form with
// many more fields than a typical row-edit card (e.g. a full boat profile)
// may reasonably pick a wider max-w-[*] instead - the point is choosing a
// width that fits the field count, never stretching to 100%.
export const FORM_CARD_CLASS = "mx-auto flex w-full max-w-[640px] flex-col gap-2.5 rounded-xl border border-fleet-border bg-white p-3";

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

// One option row for every dropdown list (CustomSelect, NationalitySelect,
// TechnicianSelect) so hover, keyboard highlight and the chosen option read
// the same everywhere: highlight = paper, chosen = teal tint + bold (and a
// check mark in the component), chosen + highlighted = slightly deeper tint.
export const OPTION_ROW_BASE_CLASS =
  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm";
export function optionRowStateClass(selected: boolean, highlighted: boolean): string {
  if (selected) return highlighted ? "bg-fleet-teal/15 font-bold text-fleet-teal" : "bg-fleet-teal/10 font-bold text-fleet-teal";
  return highlighted ? "bg-fleet-paper text-fleet-navy" : "text-fleet-navy hover:bg-fleet-paper";
}
