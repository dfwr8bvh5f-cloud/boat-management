import { round2 } from "@/lib/money";

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

// Same date-range-vs-today logic already used privately in
// bookings-manager.tsx for its trip-status pill - duplicated here rather
// than imported/shared since that function isn't exported from there and
// refactoring that unrelated file isn't part of this change.
export function charterPhase(startDate: string, endDate: string, today: string): "past" | "running" | "future" {
  if (today > endDate) return "past";
  if (today < startDate) return "future";
  return "running";
}
