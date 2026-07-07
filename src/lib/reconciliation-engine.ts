// Deterministic, rule-based bank-reconciliation engine. No AI involved here
// at all - every status/score below is produced by fixed arithmetic rules on
// dates/amounts/text, so the same input always produces the same output and
// can be reasoned about/debugged directly. AI is only ever layered on TOP of
// this, after every item below has already been decided, and only to
// annotate whatever is left in "needs_review" / "missing_*" - it can never
// change a status this engine already assigned.
//
// Guiding principle (explicit product requirement): a false "this expense is
// missing from the bank statement" is worse than an item sitting in
// "Needs Review" a little too often. Every tier below is ordered so a
// same-amount candidate is exhausted before anything is declared missing.

export type ReconciliationRecordType = "expense" | "cash_withdrawal" | "income";

export type NormalizedTxn = {
  id: string;
  recordType: ReconciliationRecordType;
  date: string; // ISO YYYY-MM-DD
  amount: number; // absolute value; sign/direction is implied by recordType
  currency: string;
  paymentMethod?: string | null;
  description: string;
  supplierName?: string | null;
  referenceNumber?: string | null;
  category?: string | null;
};

export type BankTxn = NormalizedTxn & { isBankFee?: boolean };
export type AppTxn = NormalizedTxn & { isCashExcluded?: boolean };

export type ReconciliationStatus =
  | "matched"
  | "likely_match"
  | "needs_review"
  | "missing_in_app"
  | "missing_in_bank"
  | "possible_duplicate"
  | "possible_split_match"
  | "bank_fee"
  | "excluded_cash";

export type ReconciliationResultItem = {
  status: ReconciliationStatus;
  confidence: number;
  bankItems: BankTxn[];
  appItems: AppTxn[];
  differenceAmount: number;
  notes: string;
  suggestedAction: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

// Lowercase, strip punctuation/extra spaces, drop bank boilerplate prefixes
// that carry zero identifying signal ("POS", "CARD PAYMENT", "TRANSFER",
// "SEPA", "COMMISSION", "FEE") so similarity scoring compares the part of
// the description that actually names the supplier/purpose.
const BOILERPLATE_WORDS = new Set([
  "pos",
  "card",
  "payment",
  "transfer",
  "sepa",
  "commission",
  "fee",
  "purchase",
  "debit",
  "credit",
  "עמלה",
  "העברה",
  "תשלום",
  "רכישה",
]);

export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\-_/\\|:;()"'*#]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !BOILERPLATE_WORDS.has(w))
    .join(" ");
}

// Jaccard-style token overlap - simple, dependency-free, and deliberately
// conservative: it only ever ADDS confidence points, it is never required
// for a match (per explicit requirement that description similarity must
// stay optional).
function textSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / new Set([...setA, ...setB]).size;
}

const BANK_FEE_PATTERN =
  /\b(bank\s*(commission|fee|charge)|card\s*fee|sepa\s*(fee|charge)|transfer\s*fee|wire\s*fee|account\s*maintenance|maintenance\s*fee|service\s*charge|commission)\b|עמלת?\s*(בנק|כרטיס|העברה|ניהול)|דמי\s*ניהול|προμηθει[αεως]|τελ[ηοό]+\s*τραπεζ|χρεωση\s*τραπεζ/i;

export function isBankFeeDescription(description: string): boolean {
  return BANK_FEE_PATTERN.test(description);
}

// How many days apart a bank line and an app record may be while still
// being considered the same transaction, before any description-similarity
// bonus extension. Bank transfers post almost immediately; card charges can
// take up to about a week to actually hit the account.
function baseWindowDays(appItem: AppTxn): number {
  if (appItem.recordType === "expense") {
    return appItem.paymentMethod === "bank_transfer" ? 1 : 7;
  }
  // cash withdrawals and incoming transfers post close to same-day.
  return 1;
}

type Candidate = { bank: BankTxn; app: AppTxn; score: number; diffDays: number };

// Scores one (bank line, app record) pairing, or returns null if they are
// not even eligible to be considered a candidate pair at all (different
// currency, different amount, or outside the date window entirely).
// Amount must match exactly (rounded to 2dp) - there is deliberately no
// "close amount" fuzzy tolerance here, since a wrong amount is exactly the
// kind of thing that should surface as its own reviewable discrepancy
// rather than being silently absorbed into a fuzzy match.
function scorePair(bank: BankTxn, app: AppTxn): Candidate | null {
  if (bank.currency !== app.currency) return null;
  if (round2(bank.amount) !== round2(app.amount)) return null;

  const diffDays = daysBetween(bank.date, app.date);
  const sim = textSimilarity(normalizeDescription(bank.description), normalizeDescription(app.description));
  const base = baseWindowDays(app);
  // A strong shared keyword (e.g. both mention "Disney") is a much stronger
  // signal than a bare date guess - worth searching much further out, since
  // a distinctive supplier/purpose name repeating on both sides is very
  // unlikely to be a coincidence, unlike a same amount alone.
  const maxWindow = sim >= 0.5 ? Math.max(base, 30) : sim > 0 ? Math.max(base, 10) : base;
  if (diffDays > maxWindow) return null;

  let score = 70; // +50 same amount, +20 same currency
  if (diffDays === 0) score += 30;
  else if (diffDays <= 1) score += 15;
  else if (diffDays <= 3) score += 12;
  else score += 10;

  if (sim >= 0.5) score += 10;
  else if (sim > 0) score += 5;

  if (bank.recordType === app.recordType) score += 5;
  else score -= 20; // cross-type pairing: only the AI misclassified the bank line's type, or a genuine coincidence - keep it well below "matched"

  return { bank, app, score: Math.max(0, Math.min(100, score)), diffDays };
}

function statusForScore(score: number): "matched" | "likely_match" | "needs_review" {
  if (score >= 95) return "matched";
  if (score >= 75) return "likely_match";
  return "needs_review";
}

// Looks for a small combination (2-3) of items from `pool` whose amounts
// sum to `targetAmount`, all within `windowDays` of `targetDate`. Used both
// directions: several small app expenses that were charged together as one
// card transaction, and (rarer) one app expense that was actually paid in
// installments spread across several bank lines.
function findSplitCombo<T extends { id: string; amount: number; date: string }>(
  pool: T[],
  targetAmount: number,
  targetDate: string,
  windowDays: number
): T[] | null {
  const candidates = pool.filter((c) => daysBetween(c.date, targetDate) <= windowDays);
  const n = Math.min(candidates.length, 12); // keep combinations bounded
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (round2(candidates[i].amount + candidates[j].amount) === round2(targetAmount)) {
        return [candidates[i], candidates[j]];
      }
      for (let k = j + 1; k < n; k++) {
        if (round2(candidates[i].amount + candidates[j].amount + candidates[k].amount) === round2(targetAmount)) {
          return [candidates[i], candidates[j], candidates[k]];
        }
      }
    }
  }
  return null;
}

export function reconcile(bankItemsIn: BankTxn[], appItemsIn: AppTxn[]): ReconciliationResultItem[] {
  const results: ReconciliationResultItem[] = [];

  // 1. Pull out cash expenses - they never touch a bank statement by
  // definition, so they can never be "missing in bank" and must never enter
  // the matching pool at all.
  const cashExcluded = appItemsIn.filter((a) => a.isCashExcluded);
  for (const a of cashExcluded) {
    results.push({
      status: "excluded_cash",
      confidence: 100,
      bankItems: [],
      appItems: [a],
      differenceAmount: 0,
      notes: "",
      suggestedAction: "",
    });
  }
  let appPool = appItemsIn.filter((a) => !a.isCashExcluded);

  // 2. Bank fees/commissions are not something the user necessarily entered
  // manually, so a missing app-side counterpart is expected and not a
  // discrepancy - BUT if she did enter one (e.g. via the one-click "accept
  // as bank fee" action), it must still be allowed to match normally like
  // any other transaction. So a fee line is never pulled out of the pool
  // up front; it goes through the exact same matching tiers as everything
  // else below, and is only ever classified as "bank_fee" (instead of
  // "missing_in_app") at the very end, if nothing claimed it.
  const isFeeLine = (b: BankTxn) => b.isBankFee || isBankFeeDescription(b.description);
  let bankPool = bankItemsIn;

  // 3. Score every remaining (bank, app) pair that's even eligible, then
  // assign greedily in descending score order. Sorting globally first (
  // rather than resolving bank-line-by-bank-line in array order) is what
  // guarantees an exact same-day/same-amount match always wins over a
  // weaker candidate, and that one record is never claimed twice.
  const allCandidates: Candidate[] = [];
  for (const bank of bankPool) {
    for (const app of appPool) {
      const c = scorePair(bank, app);
      if (c) allCandidates.push(c);
    }
  }
  allCandidates.sort((a, b) => b.score - a.score || a.diffDays - b.diffDays);

  const usedBankIds = new Set<string>();
  const usedAppIds = new Set<string>();
  for (const c of allCandidates) {
    if (usedBankIds.has(c.bank.id) || usedAppIds.has(c.app.id)) continue;
    usedBankIds.add(c.bank.id);
    usedAppIds.add(c.app.id);
    const status = statusForScore(c.score);
    results.push({
      status,
      confidence: c.score,
      bankItems: [c.bank],
      appItems: [c.app],
      differenceAmount: round2(c.bank.amount - c.app.amount),
      notes:
        c.diffDays === 0
          ? ""
          : `${c.diffDays === 1 ? "1 day" : `${Math.round(c.diffDays)} days`} apart, same amount`,
      suggestedAction: status === "matched" ? "" : "review_date",
    });
  }

  bankPool = bankPool.filter((b) => !usedBankIds.has(b.id));
  appPool = appPool.filter((a) => !usedAppIds.has(a.id));

  // 4. Split / combined matching for whatever amount-mismatches remain: a
  // single bank charge that is really several app expenses added together,
  // or (rarer) one app expense actually settled as several bank lines.
  // Never auto-approved - always surfaced as its own reviewable status.
  const stillUsedApp = new Set<string>();
  const stillUsedBank = new Set<string>();
  for (const bank of bankPool) {
    const sameTypePool = appPool.filter((a) => a.recordType === bank.recordType && !stillUsedApp.has(a.id));
    const combo = findSplitCombo(sameTypePool, bank.amount, bank.date, baseWindowDays({ ...bank, paymentMethod: "card" } as AppTxn));
    if (combo) {
      for (const c of combo) stillUsedApp.add(c.id);
      stillUsedBank.add(bank.id);
      results.push({
        status: "possible_split_match",
        confidence: 65,
        bankItems: [bank],
        appItems: combo as AppTxn[],
        differenceAmount: 0,
        notes: `${combo.length} app records sum to this bank line`,
        suggestedAction: "review_split",
      });
    }
  }
  bankPool = bankPool.filter((b) => !stillUsedBank.has(b.id));
  appPool = appPool.filter((a) => !stillUsedApp.has(a.id));

  const stillUsedApp2 = new Set<string>();
  const stillUsedBank2 = new Set<string>();
  for (const app of appPool) {
    const sameTypePool = bankPool.filter((b) => b.recordType === app.recordType && !stillUsedBank2.has(b.id));
    const combo = findSplitCombo(sameTypePool, app.amount, app.date, baseWindowDays(app));
    if (combo) {
      for (const c of combo) stillUsedBank2.add(c.id);
      stillUsedApp2.add(app.id);
      results.push({
        status: "possible_split_match",
        confidence: 65,
        bankItems: combo as BankTxn[],
        appItems: [app],
        differenceAmount: 0,
        notes: `${combo.length} bank lines sum to this app record`,
        suggestedAction: "review_split",
      });
    }
  }
  bankPool = bankPool.filter((b) => !stillUsedBank2.has(b.id));
  appPool = appPool.filter((a) => !stillUsedApp2.has(a.id));

  // 4b. Amount-typo tier: same day (or one day off) but the amount is
  // slightly different - almost always a transcription slip on whichever
  // side wasn't read straight from the original document, not a real gap.
  // Deliberately tight (small day window, small relative difference) so it
  // only ever catches typos, never masks a genuinely different transaction.
  for (const bank of bankPool.slice()) {
    const sameTypePool = appPool.filter((a) => a.recordType === bank.recordType && a.currency === bank.currency);
    const candidates = sameTypePool.filter(
      (a) =>
        daysBetween(a.date, bank.date) <= 1 &&
        round2(a.amount) !== round2(bank.amount) &&
        Math.abs(a.amount - bank.amount) <= Math.max(1, bank.amount * 0.05)
    );
    if (candidates.length === 0) continue;
    const best = candidates.reduce((b, c) => (daysBetween(c.date, bank.date) < daysBetween(b.date, bank.date) ? c : b));
    bankPool = bankPool.filter((b) => b.id !== bank.id);
    appPool = appPool.filter((a) => a.id !== best.id);
    results.push({
      status: "needs_review",
      confidence: 55,
      bankItems: [bank],
      appItems: [best],
      differenceAmount: round2(bank.amount - best.amount),
      notes: "Same date, amount differs slightly - possible typo",
      suggestedAction: "review_amount",
    });
  }

  // 5. Duplicate detection among whatever app records are STILL left
  // unmatched: two entries with the same amount/currency within a couple of
  // days of each other are far more likely to be the same expense entered
  // twice than two genuinely separate missing transactions. Flagged only,
  // never auto-merged/deleted.
  const duplicateIds = new Set<string>();
  for (let i = 0; i < appPool.length; i++) {
    for (let j = i + 1; j < appPool.length; j++) {
      const a = appPool[i];
      const b = appPool[j];
      if (a.recordType !== b.recordType) continue;
      if (round2(a.amount) !== round2(b.amount)) continue;
      if (daysBetween(a.date, b.date) > 2) continue;
      duplicateIds.add(a.id);
      duplicateIds.add(b.id);
      results.push({
        status: "possible_duplicate",
        confidence: 60,
        bankItems: [],
        appItems: [a, b],
        differenceAmount: 0,
        notes: "Same amount entered twice within a couple of days",
        suggestedAction: "review_duplicate",
      });
    }
  }
  appPool = appPool.filter((a) => !duplicateIds.has(a.id));

  // 6. Whatever is left after every tier above is a genuine gap - unless
  // it's a bank fee with nothing on the app side, which is expected and not
  // a discrepancy at all.
  for (const b of bankPool) {
    if (isFeeLine(b)) {
      results.push({
        status: "bank_fee",
        confidence: 100,
        bankItems: [b],
        appItems: [],
        differenceAmount: 0,
        notes: "",
        suggestedAction: "",
      });
      continue;
    }
    results.push({
      status: "missing_in_app",
      confidence: 0,
      bankItems: [b],
      appItems: [],
      differenceAmount: b.amount,
      notes: "",
      suggestedAction: "create_app_record",
    });
  }
  for (const a of appPool) {
    results.push({
      status: "missing_in_bank",
      confidence: 0,
      bankItems: [],
      appItems: [a],
      differenceAmount: -a.amount,
      notes: "",
      suggestedAction: "verify_record",
    });
  }

  return results;
}

// Statuses shown to the user by default - everything actionable. Matched,
// bank-fee, and excluded-cash items are real but not something she needs to
// look at every time, so the UI keeps them collapsed behind an explicit
// toggle rather than hiding them from the underlying data.
export const DEFAULT_VISIBLE_STATUSES: ReconciliationStatus[] = [
  "missing_in_app",
  "missing_in_bank",
  "needs_review",
  "possible_duplicate",
  "possible_split_match",
  "likely_match",
];

export const HIDDEN_BY_DEFAULT_STATUSES: ReconciliationStatus[] = ["matched", "bank_fee", "excluded_cash"];
