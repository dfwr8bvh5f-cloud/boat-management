# MYS FLEET — Design System Reference

This is the single source of truth for visual and behavioral conventions
across the app, covering both the MYS screens (`src/app/(app)/mys/**`,
`src/components/mys-*.tsx`) and the per-boat screens
(`src/app/(app)/boats/[id]/**`, `src/components/expenses-manager.tsx`,
`issues-manager.tsx`, etc.), plus the fleet-wide Technical section and
newer features (Inventory, Owner Trip report). Compiled from a full
comparative code audit (October 2026). Where a rule is already enforced by
a shared constant/component, that's named directly — use it instead of
re-typing the class string.

## Color

The palette is semantic, not decorative — the same meaning always gets the
same color:

| Token | Hex | Meaning |
|---|---|---|
| `fleet-navy` | `#0b1f38` | Primary — titles, primary nav, icons on a tinted bg |
| `fleet-paper` / white | — | Backgrounds |
| `fleet-brass` | `#4c6585` | Highlight / pending / awaiting action |
| `fleet-coral` | — | Warning / destructive / rejected / overdue |
| `fleet-moss` | `#78bb7a` | Success / approved / paid |
| `fleet-teal` | — | Primary interactive accent (buttons, selected filter chips, links) |
| `fleet-ink` | `#5b6472` | Secondary text, neutral/no-value swatch |
| `fleet-border` | `#e3e6ec` | Card/table borders everywhere, including print |

**Rule: never use Tailwind's default gray scale (`text-gray-500`,
`border-gray-300`, etc.) or an unregistered hex literal.** Always use
`text-fleet-ink`/`border-fleet-border` or a named constant. A one-off
fallback color (e.g. "no subcategory" in a chart) must reuse an existing
fleet-* hex, never invent a new one inline.

**Status color convention** (the single most-violated rule in the audit):
- *Pending / awaiting action / not yet paid* → **brass**, never coral.
- *Approved / paid / success* → **moss**.
- *Rejected / overdue / destructive* → **coral**.
- *Draft / not yet active* → neutral (fleet-ink), not coral.
A "record payment" or "approve" action button follows the state it's
acting on, not an arbitrary outline style.

**Approve action = solid fill.** `bg-fleet-teal ... text-white`
(`expense-approval-card.tsx`, `issue-approval-card.tsx` are the reference).
Never an outline chip — that's reserved for secondary/neutral actions
(Print, Edit).

**Category/chart palettes** are fixed, named arrays, never generated:
`EXPENSE_CATEGORY_COLORS`, `MYS_EXPENSE_CATEGORY_COLORS`,
`OWNER_TRIP_SUBCATEGORY_COLORS`, `PAYMENT_METHOD_COLORS` (all in
`src/lib/labels.ts`). A new categorical set reuses hex values from one of
these rather than inventing a parallel palette, and should be validated
with the dataviz skill's `validate_palette.js` before shipping.

## Typography

- **Page title**: `font-brand text-2xl font-light tracking-wide text-fleet-navy`
  — every top-level screen has exactly one of these, top-left, next to the
  primary action button (top-right) on the same row. A section layout with
  its own tab strip (MYS, Technical) omits a layout-level title and lets
  each tab's own page/manager render this h1 itself — every tab must still
  have one.
- **Report/printed-document title**: `font-brand text-4xl font-light
  text-fleet-navy print:text-2xl` (see `financial-report-document.tsx`,
  `owner-trip-report-document.tsx` — identical `sectionTitleClass`/
  `cardClass` locals, copy this pair for any new report document).
- **Section heading** (h2 inside a report): `text-2xl font-semibold
  tracking-tight text-fleet-navy print:text-lg print:break-after-avoid`.
- **Weight rule**: `font-bold` for primary buttons, financial totals/
  balances, page/section titles — anything the eye should land on first.
  `font-semibold` for card/table headers, secondary labels, inline action
  links ("edit", "update"). Applies to `<th>` cells too, including in
  print-only tables (Tailwind's preflight does not reset `<th>` weight —
  an unstyled `<th>` renders browser-default bold/dark, not the intended
  `font-semibold text-fleet-ink`).
- **Table header style** (the canonical one — use everywhere, including
  statement/invoice documents): `border-b border-fleet-border text-xs
  font-semibold tracking-wide text-fleet-ink uppercase`.

## Buttons & Icons

Always compose from the shared constants in `src/lib/ui-classes.ts`:
- `PRIMARY_BUTTON_CLASS` — solid fleet-teal, white text, includes
  `active:scale-[0.97]` press feedback and `disabled:opacity-60`.
- `SECONDARY_BUTTON_CLASS` — outlined, `hover:bg-fleet-paper`, same press
  feedback.
- `INPUT_CLASS` / `INPUT_CLASS_COMPACT` / `INPUT_CLASS_INLINE` — form
  fields, all three include the focus ring and `:user-invalid` coral cue.

Never hand-retype these strings in a component-local `const inputClass =
...` — that's how the focus ring and press feedback silently go missing.

**"Add X" pill button** (the rounded-full, top-right primary action):
`rounded-full bg-fleet-navy px-4 py-2 text-sm font-semibold
text-fleet-paper transition-transform hover:opacity-90
active:scale-[0.97]` — the `transition-transform active:scale-[0.97]`
suffix is required on every instance, not optional.

**Row action icons** (edit/delete on a list row): `Pencil`/`Trash2` at
`size={16}` inside an `h-9 w-9` tap target is the default. A denser row
(3+ inline data fields packed into the same line) may drop to `size={14}`
inside `h-8 w-8` — but default to the larger size unless the row is
genuinely that tight.

**Delete** is always `Trash2`, wrapped in `ConfirmSubmitButton` with a
`confirmMessage`. **Edit** is always `Pencil`. **Add** is always `Plus`.
**Close/Cancel** is always the same `SECONDARY_BUTTON_CLASS` button with
the `close_word` key — shown **unconditionally** next to Save, in both the
"adding new" and "editing existing" states of a form. (A form long enough
to require scrolling can't rely on a header toggle button as the only way
to cancel.)

**Save button feedback** (required on every save action, no exceptions):
`disabled={saving || saved}`, showing `<RippleLoader size="sm" />` +
`{t("saving_word")}` while saving, then `<span
className="animate-pop-in">{t("saved_word")}</span>` once saved. A plain
static-label submit button (no spinner, no disabled state) is a bug.

**Print/export button**: `rounded-full border border-fleet-border px-3
py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper` with
`<Printer size={14} />` — this is the dominant existing convention
(5+ call sites); the shared `PrintButton` component and the Inventory
tab's own print button should converge on it rather than their own
filled/teal variants.

## Tables & Lists

**List row** (the default "one row = one card"):
`flex flex-nowrap items-center gap-1.5 rounded-xl border
border-fleet-border bg-white p-3 sm:gap-3`. Confirmed as the dominant
pattern across both MYS and boat lists already (debts, income,
commissions, invoices, expenses, issues, inventory, technician visits).
A row that needs an expandable detail section uses `flex flex-col gap-2`
as an outer wrapper around this same inner row, not a replacement for it.

**Empty state**: `rounded-xl border border-dashed border-fleet-brass
bg-white p-6 text-center text-sm text-fleet-ink` — confirmed consistent
everywhere, including the new Inventory list. Keep using it for any new
list.

**Filter chip** (toggle, in a collapsible filter panel): `rounded-full
border px-2.5 py-1 text-xs font-bold`, selected state `border-fleet-teal
bg-fleet-teal text-white`, unselected `border-fleet-border`. The filter
panel itself starts collapsed (`useState(false)`) regardless of whether a
filter is already active — that's the actual, uniformly-followed
convention (not "open if active," despite how it might look).

**Amounts & dates in RTL text**: a value that can be negative (a balance)
always goes through `formatCurrencySigned`, never plain `formatCurrency`
— the signed variant exists specifically to avoid an RTL bidi-wrap bug
(see `src/lib/money.ts`'s own comment). Any amount or date inlined inside
Hebrew sentence text gets `<span dir="ltr">`; a non-negative amount shown
in its own dedicated cell/line does not need the wrapper.

**Missing value**: always `t("not_set_yet")`, never a bare `"—"` or empty
string, for any field that's genuinely unset (date, category, payment
method, subcategory).

## Forms

- Required field label gets a trailing `" *"`. Optional fields never do.
- A "must actively choose, no silent default" field (e.g. a category that
  shouldn't pre-select its first option) uses `CustomSelect` with
  `emphasizeEmpty` + `placeholder={t("choose_category")}` + a
  `categoryError` state shown as `text-xs text-fleet-coral-text` if
  submitted empty. Reference: `boat-inventory-manager.tsx`,
  `technical-specs-manager.tsx`.
- A genuinely optional field with a sensible "none" state renders that
  state as a real selectable option (`{ value: "", label:
  t("not_set_yet") }`), not a placeholder.

## Cards & Modals

- **Card** (list row, form panel, summary tile): `rounded-xl border
  border-fleet-border bg-white`, `p-3` for a list row, `p-4` for a
  form/filter panel. No `rounded-lg`/`rounded-2xl` card role exists
  anywhere in the app — don't introduce one.
- **Confirm popup**: always the shared `ConfirmPopup` component
  (`src/components/confirm-popup.tsx`) or `ConfirmSubmitButton` for a
  form-action delete. Never hand-roll the `fixed inset-0 z-[70]
  flex items-center justify-center bg-black/30 p-4` shell inline — every
  styling tweak to the shared component (shadow, gap, corner radius) has
  to propagate everywhere, which only works if nothing duplicates it.
- **Modal/overlay z-index**: `z-[70]` for a confirm/inline modal, `z-50`
  for an image lightbox/viewer. Keep new overlays on one of these two,
  not a third value.

## Structure & Layout

- Outer page wrapper: `flex flex-col gap-4` for a "manager" screen
  (title + toolbar + list), `gap-6` for a simpler single-column page
  (settings, a plain form page). Both are followed correctly across MYS,
  boats, and the newer screens — keep it that way.
- Title (top-left) + primary action button (top-right) share one
  `flex items-center justify-between` row. Search box and filter toggle
  sit below that row, inside the same `print:hidden` wrapper as the rest
  of the page chrome.

## Behavior

- **Delete confirmation wording**: `"Permanently delete this <X>? This
  cannot be undone."` (he: `"למחוק את ה<X> לצמיתות? הפעולה בלתי הפיכה."`)
  — this exact template, every time, for every kind of row. No bare
  `"Delete this X?"` with the warning clause dropped.
- **Close/Cancel**: see Buttons section — always present, in both add and
  edit mode.
- **Delete feedback**: silent list refresh via `revalidatePath`/router
  refresh. No post-delete toast/success message exists anywhere in the
  app — keep it that way, don't add one to just one screen.
- **Save feedback**: see Buttons section (RippleLoader → "saved" pop-in).

## Mobile & Accessibility

- Icon-only buttons always get a real `aria-label` via `t(...)`, not a
  hardcoded English literal — use the shared `edit_word`/`delete_word`
  keys.
- Tap targets for row-level icon buttons: `h-9 w-9` default (see Buttons).
- Any state distinguished only by color on a small element (a calendar day
  cell, a chart segment) needs a redundant signal too — a count badge, an
  icon, or a direct text label in an adjacent legend. Never color-alone.
- A fixed-width column next to a flex-1 element (e.g. a bar chart's label
  column) needs `truncate` or a responsive width step — a long Hebrew
  label can run longer than its English equivalent and must not break the
  row's alignment on a narrow viewport.

## i18n

- One key per concept, reused by both MYS and boat screens where the
  concept is identical (e.g. "add expense" should not have a parallel
  `mys_add_expense` duplicate with its own drift risk) — check
  `src/lib/i18n/dictionaries.ts` for a close match before adding a new key.
- Every key exists in all three locale blocks (he/en/el) with matching
  meaning, not just matching key name.

---

*This document should be updated whenever a new shared convention is
introduced, or an existing one is deliberately changed. A future design
audit should start by checking this file is still accurate, not by
re-deriving these rules from scratch.*
