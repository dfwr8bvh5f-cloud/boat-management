import type { PaymentMethod } from "@/lib/types/database";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A negative amount is a cash withdrawal only if the description or the
// statement's own category column says so (ATM/withdrawal wording, in the
// languages her statements use) - otherwise every other negative amount is
// an ordinary expense. This is the only piece of the direction-
// classification that still reads text at all, and it's a fixed keyword
// match, not a judgment call.
//
// Confirmed in production (Piraeus Bank e-banking exports, used by
// STEPHANIE/SAMARA/MINTU/LULU): a real ATM cash withdrawal's own merchant
// description is often just the travel agency or shop that dispensed the
// cash (e.g. "KINISIS TRAVEL ΛΕΥΚΑΔΑ") with no ATM/withdrawal wording in it
// at all - the word that actually identifies it as a withdrawal only ever
// appears in the statement's separate "Κατηγορία" (category) column
// ("ΑΤΜ-ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ"), which scan-bank-statement's AI extraction asks
// the model to copy alongside the description specifically so this pattern
// can check it too.
const CASH_WITHDRAWAL_PATTERN = /\bATM\b|cash\s*withdrawal|\bwithdrawal\b|משיכת\s*מזומן|כספומט|ΑΤΜ|ΑΝΑΛ[ΗΉ]ΨΗ|αναλ[ηή]ψη/i;

// Same idea as CASH_WITHDRAWAL_PATTERN: whether a line was paid by card or
// bank transfer is read straight off the statement's own wording, never
// defaulted or guessed - a statement that doesn't say either way leaves
// payment_method unset (undefined) so she picks it herself instead of the
// app silently assuming "card" for something that might have been a
// transfer, or vice versa.
const CARD_PATTERN = /\bcard\b|\bpos\b|visa|mastercard|maestro|כרטיס\s*אשראי|\bכרטיס\b|κάρτ/i;
const TRANSFER_PATTERN = /\btransfer\b|\bsepa\b|\biban\b|\bwire\b|העברה|μεταφορ|έμβασμ|εμβασμ/i;

function classifyPaymentMethod(description: string): PaymentMethod | undefined {
  if (CARD_PATTERN.test(description)) return "card";
  if (TRANSFER_PATTERN.test(description)) return "bank_transfer";
  return undefined;
}

// Deterministic, rule-based classification of a signed amount into the
// app's line_type - never delegated to the AI, since a wrong income/
// expense call silently flips a transaction's direction. The AI's only job
// (in scan-bank-statement's prompt) is to copy the amount with its correct
// sign, plus the statement's own category column verbatim if it has one -
// the pattern match below on description+category is everything else,
// fixed arithmetic and text matching, not a judgment call. payment_method
// is classified the same way, from the same description text.
export function classifyLine(
  rawAmount: number,
  description: string,
  category?: string | null
): { line_type: "expense" | "cash_withdrawal" | "income"; amount: number; payment_method?: PaymentMethod } {
  const payment_method = classifyPaymentMethod(description);
  if (rawAmount >= 0) return { line_type: "income", amount: round2(rawAmount), payment_method };
  const line_type = CASH_WITHDRAWAL_PATTERN.test(`${description} ${category ?? ""}`) ? "cash_withdrawal" : "expense";
  return { line_type, amount: round2(Math.abs(rawAmount)), payment_method };
}
