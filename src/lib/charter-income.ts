import { round2 } from "@/lib/money";
import { localDateToISO } from "@/lib/date-format";

// Only OUR OWN commission and its VAT are fixed rates - the user confirmed
// the agent/broker side is not: some charters have no agent at all, some
// deduct an extra VAT on top of the agent's cut, some use a discounted or
// non-standard split entirely, and there's no way to know in advance which
// applies to a given contract. So agent commission is never assumed at a
// fixed rate - it's derived as whatever's left between the gross price and
// the net-to-owner figure (which is always stated directly on the real
// booking confirmation, e.g. "Gross price EUR 70000 ... Price Net to you:
// EUR 56000") once our own known deductions are accounted for. Verified
// against 13 real contracts (Stephanie + 12 Lulu ones): this residual
// exactly reproduces each contract's own reported agent-side deduction,
// whether that was a plain 15% commission, 15% + an extra VAT-on-agent
// line, or a one-off non-standard split - because it doesn't presume the
// mechanism, only the two numbers that were actually agreed.
export const CHARTER_OUR_COMMISSION_RATE = 0.05;
export const CHARTER_COMMISSION_VAT_RATE = 0.24;

// Agent commission by convention rarely exceeds 15% of the gross price - if
// the derived residual (see below) comes out above that, it's almost always
// because the agent's cut also had VAT deducted on top of it (seen on 4 of
// the 13 real contracts checked), not a genuinely larger commission. This
// threshold is only used to split that residual for display purposes below.
const AGENT_COMMISSION_TYPICAL_MAX_RATE = 0.15;

export type CharterBreakdown = {
  agentCommission: number;
  agentCommissionBase: number;
  vatOnAgentCommission: number;
  ourCommission: number;
  totalCommission: number;
  netCharterPrice: number;
  vatOnGross: number;
  vatOnOurCommission: number;
  netToOwner: number;
};

// netToOwner is a real input here (not computed) - see the module comment.
// APA is deliberately not a parameter: checked across all 13 real
// contracts, it always sits outside the net-to-owner total (a separate,
// informational figure), so it plays no part in this calculation at all.
export function computeCharterBreakdown(input: {
  grossPrice: number;
  netToOwner: number;
  vatRate: number;
  deliveryFee: number;
  redeliveryFee: number;
}): CharterBreakdown {
  const ourCommission = round2(input.grossPrice * CHARTER_OUR_COMMISSION_RATE);
  const vatOnGross = round2(input.grossPrice * input.vatRate);
  const vatOnOurCommission = round2(-ourCommission * CHARTER_COMMISSION_VAT_RATE);
  const agentCommission = round2(
    input.grossPrice - ourCommission + input.deliveryFee + input.redeliveryFee + vatOnGross + vatOnOurCommission - input.netToOwner
  );

  // Split the residual only when it looks VAT-inclusive (see the constant's
  // comment above) - otherwise it's already just the plain commission.
  let agentCommissionBase = agentCommission;
  let vatOnAgentCommission = 0;
  if (input.grossPrice > 0 && agentCommission / input.grossPrice > AGENT_COMMISSION_TYPICAL_MAX_RATE) {
    agentCommissionBase = round2(agentCommission / (1 + CHARTER_COMMISSION_VAT_RATE));
    // Negative, like vatOnOurCommission above - both are VAT-on-commission
    // deduction lines in the real contracts (e.g. "-797.75"), not additions.
    vatOnAgentCommission = round2(agentCommissionBase - agentCommission);
  }

  const totalCommission = round2(agentCommission + ourCommission);
  const netCharterPrice = round2(input.grossPrice - totalCommission);
  return {
    agentCommission,
    agentCommissionBase,
    vatOnAgentCommission,
    ourCommission,
    totalCommission,
    netCharterPrice,
    vatOnGross,
    vatOnOurCommission,
    netToOwner: round2(input.netToOwner),
  };
}

export type ParsedCharterText = {
  charter_code: string | null;
  start_date: string | null;
  end_date: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  gross_price: number | null;
  net_price_to_owner: number | null;
};

function ddmmyyyyToISO(day: string, month: string, year: string): string {
  return localDateToISO(Number(year), Number(month) - 1, Number(day));
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

// Deterministic first pass over a pasted charter confirmation, before the
// AI endpoint is ever called - per the project's rule to prefer
// deterministic logic over AI wherever the data is structured enough to
// allow it. Every real confirmation pasted this session has followed the
// same handful of labels ("Charter code:", "Dates: ... to/- ...", "Base: X
// to Y", "Gross price ...", "Price Net to you: ..."), so a plain regex
// reliably pulls these out without depending on an AI call succeeding at
// all - the AI endpoint (parse-charter-text) is still used afterward, but
// only as a fallback for whatever field this couldn't find, matching the
// "AI only as an advisory layer on top of a deterministic result" rule.
export function parseCharterText(text: string): ParsedCharterText {
  const result: ParsedCharterText = {
    charter_code: null,
    start_date: null,
    end_date: null,
    embarkation_port: null,
    disembarkation_port: null,
    gross_price: null,
    net_price_to_owner: null,
  };

  const codeMatch = text.match(/charter\s*code[:\s]+(\S+)/i);
  if (codeMatch) result.charter_code = codeMatch[1];

  const datesMatch = text.match(
    /dates?[:\s]+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:\([^)]*\))?\s*(?:to|-|–|>)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i
  );
  if (datesMatch) {
    result.start_date = ddmmyyyyToISO(datesMatch[1], datesMatch[2], datesMatch[3]);
    result.end_date = ddmmyyyyToISO(datesMatch[4], datesMatch[5], datesMatch[6]);
  }

  const baseMatch = text.match(/base[:\s]+(.+?)\s+to\s+(.+?)(?:\r?\n|$)/im);
  if (baseMatch) {
    result.embarkation_port = baseMatch[1].trim();
    result.disembarkation_port = baseMatch[2].trim();
  }

  const grossMatch = text.match(/gross\s*price[^\d]*?([\d,]+(?:\.\d+)?)/i);
  if (grossMatch) result.gross_price = parseAmount(grossMatch[1]);

  const netMatch = text.match(/(?:net\s*to\s*(?:you|owner)|price\s*net\s*to\s*you)[^\d]*?([\d,]+(?:\.\d+)?)/i);
  if (netMatch) result.net_price_to_owner = parseAmount(netMatch[1]);

  return result;
}

// Same date-range-vs-today logic already used privately in
// bookings-manager.tsx for its trip-status pill - duplicated here rather
// than imported/shared since that function isn't exported from there and
// refactoring that unrelated file isn't part of this change.
export function charterPhase(startDate: string, endDate: string, today: string): "past" | "running" | "future" {
  if (today > endDate) return "past";
  if (today < startDate) return "future";
  return "running";
}
