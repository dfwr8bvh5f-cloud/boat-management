Run the full Application Review & Improvement pass for MYS FLEET: static checks, unit tests,
a live browser crawl of the demo account (if configured), a design/UX/code subagent review,
safe auto-fixes, and a complete report. Follow every phase below in order; do not skip ahead.

## Phase A — Static checks (always runs, no network needed)

1. `npx tsc --noEmit`
2. `npx eslint .`
3. `rm -rf .next && npm run build`

Record pass/fail for each. A failure here is a **Critical** finding by definition (broken build)
and must be fixed (or at minimum root-caused and reported) before continuing to later phases.

## Phase B — Unit tests (always runs, no network needed)

Run `npm run test`. These cover pure logic only (currency formatting, the reconciliation-engine
matching rules, the fetchAllRows pagination helper — see src/lib/*.test.ts). Record the pass/fail
count. A failing test on financially-relevant logic (reconciliation-engine, money, balances) is
**Critical**; anything else failing is at minimum **High**.

## Phase C — Browser crawl (needs BASE_URL, DEMO_USER_EMAIL, DEMO_USER_PASSWORD)

Check `echo $BASE_URL $DEMO_USER_EMAIL` (never echo the password). If any of the three required
env vars (see .env.local.example) are unset, **skip this phase entirely** and note in the report:
"Browser crawl skipped — BASE_URL/DEMO_USER_EMAIL/DEMO_USER_PASSWORD not configured in
.env.local." Do not fabricate screenshots or findings for pages that were never actually visited.

If configured:

1. `npm run test:e2e` — this logs into the demo account (e2e/fixtures/auth.ts), visits every
   route in e2e/nav-map.ts across desktop/tablet/mobile viewports, screenshots each one into
   `reports/screenshots/`, and runs an axe-core accessibility scan per page (attached to the
   Playwright HTML report at `reports/playwright-html/`).
2. If a route fails to load or times out, that is itself a **Critical** or **High** finding
   (broken workflow) — do not silently skip it, investigate the root cause in the corresponding
   src/app page/component.
3. Never write DEMO_USER_EMAIL, DEMO_USER_PASSWORD, or any value read from the live pages
   (a real name, amount, email visible in the demo data) into the report, a commit message, or
   anywhere outside `reports/` (already gitignored).

## Phase D — Design, UX, and code review (parallel subagents)

Once Phase C's screenshots exist (or, if Phase C was skipped, working from static source review
alone — say so explicitly in the report), spawn three subagents in parallel, each reading only
what it needs:

- **Design review**: reads `reports/screenshots/**`, `CLAUDE.md` section 3 (UI/UX Standards) and
  `src/app/globals.css`/`tailwind` config for the palette. Checks spacing, typography, color use,
  button hierarchy, table/report layout, empty/loading/error states, and desktop/tablet/mobile
  consistency against the existing navy/paper/brass/coral/moss direction. Must not propose a new
  visual direction — only convergence toward the one that already exists.
- **UX review**: reads the same screenshots plus the relevant `src/components/*-manager.tsx` and
  `src/lib/actions/*.ts` for each flow, from the perspective of a yacht manager doing this daily.
  Checks navigation clarity, click-count, confirmation/validation copy, and feedback after actions.
- **Code review**: reads `reports/playwright-html` (console/network errors captured per page) and
  the source for each page visited. Checks architecture, duplication, error handling, query
  patterns, unnecessary re-renders, and the axe-core violation output attached per test.

Each subagent returns findings in this shape: `{ area, severity, page/file, description,
root_cause, proposed_fix, protected: boolean }`.

## Phase E — Triage

Merge all findings. A finding is automatically `protected: true` (regardless of what the subagent
said) if it touches any of:

- `src/lib/actions/expenses.ts`, `incomes.ts`, `cash.ts`, `budget.ts`, `bank-statement.ts`,
  `reports.ts` (financial calculations / accounting logic)
- `src/lib/reconciliation-engine.ts`, `src/lib/balances.ts`, `src/lib/report-data.ts`
  (financial matching / balance logic)
- `src/lib/actions/staff.ts` where it touches `salary` (payroll)
- `src/lib/actions/users.ts`, `src/lib/auth.ts`, `src/lib/boat-access.ts`, `src/middleware.ts` /
  `src/lib/supabase/middleware.ts` (authentication/authorization)
- anything under `supabase/migrations/` (schema)
- any change that would delete or overwrite existing data

Classify every remaining finding Critical/High/Medium/Low per the definitions in the project's
review-agent brief, and order the fix queue: security/data integrity → broken functionality →
performance/reliability → major UX → design-system consistency → shared components →
page-specific polish → accessibility.

## Phase F — Safe auto-fixes

For each non-protected finding, in priority order:

1. Make the smallest change that fixes it.
2. Re-run Phase A + Phase B (and the specific Phase C test for that page, if configured).
3. If verification fails, revert that specific change and mark it "attempted, reverted -
   see notes" in the report rather than leaving a broken state.
4. Commit on its own (one fix per commit, following this repo's existing commit-message style)
   — never batch unrelated fixes into one commit.

Protected findings are never touched here — they go straight to the report's "Approval Required"
section with the proposed fix and estimated impact, exactly as documented in Phase D/E.

## Phase G — Report

Write `reports/app-review-<date>.md` with all 19 sections: executive summary; overall/UI/UX/
performance/reliability/accessibility scores (0–10, with one sentence justifying each); pages and
workflows reviewed (from e2e/nav-map.ts, marking any skipped); findings ranked by severity;
screenshots (reference `reports/screenshots/**`, do not inline/duplicate the files); root cause
per technical issue; changes implemented with files changed; tests added/updated and their
results; before/after screenshot pairs for anything visually changed; remaining recommendations;
Approval Required items; regressions or risks detected. Finish with a short, plain-language
changelog (no jargon) suitable for a non-technical reader.

Report back a concise summary in the chat: overall score, count of findings by severity, count
auto-fixed vs. approval-required, and the path to the full report file.
