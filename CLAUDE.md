@AGENTS.md

# MYS FLEET — Development Guide

This is the permanent development standard for this project. Read it before
starting every task, and follow it for every change, however small.

## 1. General Development Principles

- Understand the existing implementation before making changes — read the
  relevant file(s) end to end, not just the lines you expect to touch.
- Make the smallest possible change required to satisfy the request.
- Never refactor unrelated code unless explicitly requested. A bug fix does
  not need a cleanup pass; a one-line feature does not need a new
  abstraction.
- Never remove existing functionality without approval.
- Preserve backwards compatibility whenever possible — existing data,
  existing URLs, existing exported function signatures other files rely on.
- Prefer reliability over cleverness. Boring, obviously-correct code beats a
  compact trick.

## 2. Debugging Workflow

Before claiming a task is complete:

1. Verify the correct component/file was modified — confirm there is a
   single source of truth (no duplicate/orphaned file with the same name)
   and that the change actually sits on the import chain the route uses.
2. Verify the application builds successfully (`npm run build`), with zero
   TypeScript errors.
3. Verify there are no runtime errors — for server-only logic, this means
   actually exercising the code path (a build passing is necessary but not
   sufficient).
4. Verify the requested functionality actually works. If a live check is
   possible (dev server, Playwright, a script that calls the real function),
   do it. If it is not possible from inside this environment (for example,
   this session's network policy blocks outbound calls to Supabase and to
   the deployed Vercel URL — this has happened before and is a real, fixed
   boundary, not something to retry around), say so explicitly instead of
   assuming success. Verify everything that is reachable (build, compiled
   output, local runtime smoke test) and clearly name the part that isn't.
5. If the requested change is not visible or not confirmed, continue
   debugging instead of reporting success.
6. Never claim success without verification. "I edited the file" is not the
   same as "I confirmed the file that runs contains the edit."

## 3. UI / UX Standards

The app should stay premium, elegant, and minimalist — this project already
has an established design system; don't introduce a competing one.

- Palette: the existing nautical Tailwind theme (`fleet-navy`, `fleet-brass`,
  `fleet-coral`, `fleet-moss`, `fleet-paper`, plus white) is the palette.
  Navy is primary; paper/white are backgrounds; brass/coral/moss are
  reserved for meaningful signal (brass = highlight/pending, coral =
  warning/destructive, moss = success/approved) — not decoration. Don't add
  new ad hoc colors outside this set.
- Clean spacing, consistent typography (Noto Sans Hebrew), RTL-first layout
  (Hebrew is the primary locale; English and Greek are also supported via
  `src/lib/i18n`).
- Modern but professional appearance. Avoid childish icons — this project
  uses `lucide-react` consistently; stay within that icon set.
- Prefer subtle interactions over flashy animations.
- Preserve visual consistency across all screens — check how an equivalent
  existing screen solved the same layout problem before inventing a new
  pattern.

## 4. Financial Data Rules

Financial correctness is the highest priority in this app.

- Never guess financial data. Never fabricate an amount, date, or match.
- Prefer deterministic logic over AI whenever possible. AI is only ever
  acceptable for OCR/extraction (reading a document into structured text) or
  as an optional advisory layer on top of an already-deterministic result —
  never as the thing deciding whether two records match.
- Avoid false positives above all else: a false "this doesn't match" or a
  false "these are the same transaction" is worse than leaving something
  unresolved.
- If the system is uncertain, mark the transaction "Needs Review" instead of
  guessing or silently creating an incorrect match.

## 5. Bank Reconciliation Rules

The reconciliation engine (`src/lib/reconciliation-engine.ts`, wired into
`src/app/api/scan-bank-statement/route.ts` and
`src/app/(app)/boats/[id]/finance/bank-reconciliation/page.tsx`) is the
reference implementation of these rules — extend it, don't bypass it:

- Normalize data first (amounts rounded to 2 decimals, dates to ISO,
  descriptions lowercased/stripped of boilerplate) before comparing anything.
- Exclude cash expenses from bank matching entirely — they can never appear
  on a bank statement.
- Bank fees/commissions are auto-recognized and excluded from "missing"
  reporting — a fee is not something a captain manually enters as an
  expense, so its absence from Expenses is not a discrepancy.
- Exact deterministic matching (same amount, same date, same currency)
  always runs first and always wins — it is never sent to AI and never
  shown as a discrepancy.
- Flexible matching (date-window tolerant, description-similarity boosted)
  runs only after exact matching is exhausted, one-to-one, never double
  claiming a record.
- AI, if used at all, only ever analyzes what's left unresolved after every
  deterministic tier has run — it never overrides a deterministic result.
- Never create a discrepancy when a valid deterministic match already
  exists. When genuinely uncertain, the correct status is "Needs Review",
  not a guess in either direction.

## 6. Database Safety

Never, without explicit approval for that specific change:

- rename database fields
- delete columns
- change schema
- create migrations

This environment has no direct network access to the production Supabase
project, so schema changes are always delivered as a downloadable `.sql`
migration file for manual review and application — never assume a migration
has been run just because the file was written. Always preserve existing
data; prefer additive changes over destructive ones.

## 7. Code Quality

- Keep components small and focused.
- Avoid duplicated logic — check `src/lib/` (`labels.ts`, `date-format.ts`,
  `balances.ts`, `reconciliation-engine.ts`, etc.) for an existing helper
  before writing a new one.
- Reuse existing utilities and established patterns (server actions in
  `src/lib/actions/*`, i18n via `src/lib/i18n/dictionaries.ts` with parallel
  `he`/`en`/`el` blocks, Supabase access via `src/lib/supabase/*`).
- Write readable code; keep naming consistent with the surrounding file.
- Prefer the simple solution over the general one, unless asked to
  generalize.

## 8. Performance

- Avoid unnecessary API/database calls — batch queries, reuse data already
  fetched on the page instead of re-querying.
- Avoid unnecessary re-renders in client components.
- Optimize genuinely expensive calculations; don't prematurely optimize
  cheap ones.

## 9. Error Handling

- Never silently swallow errors — at minimum, log them server-side
  (`console.error` with enough context to act on) even where the user-facing
  message stays simple.
- Provide meaningful error messages, translated via the i18n system rather
  than hardcoded.
- Handle edge cases explicitly (empty lists, null dates, missing optional
  fields) rather than assuming happy-path data.

## 10. Task Completion Checklist

Before reporting success, verify:

- [ ] Requested functionality works.
- [ ] No existing functionality was broken.
- [ ] No build errors.
- [ ] No runtime errors.
- [ ] No TypeScript errors.
- [ ] UI behaves correctly (single-line rows stay single-line, RTL/dates
      display correctly, no layout regressions).
- [ ] Database integrity preserved (no unintended schema/data changes).
- [ ] Financial logic remains correct (no false matches, no false
      discrepancies, no fabricated amounts).

If any of these checks fail, continue debugging instead of marking the task
as completed.
