import { round2 } from "@/lib/money";

// Fixed everywhere - only the VAT-on-gross rate varies by boat (see
// boats.charter_vat_rate). These mirror the exact formulas from the user's
// own "CHARTER ANALYSIS" spreadsheet: C13=C14+C15, C14=C12*15%, C15=C12*5%,
// C16=C12-C13, C20=C12*VAT%, C21=-(C15)*24%, C22=SUM(C16:C21).
export const CHARTER_AGENT_COMMISSION_RATE = 0.15;
export const CHARTER_OUR_COMMISSION_RATE = 0.05;
export const CHARTER_COMMISSION_VAT_RATE = 0.24;

export type CharterBreakdown = {
  agentCommission: number;
  ourCommission: number;
  totalCommission: number;
  netCharterPrice: number;
  vatOnGross: number;
  vatOnOurCommission: number;
  netToOwner: number;
};

export function computeCharterBreakdown(input: {
  grossPrice: number;
  vatRate: number;
  deliveryFee: number;
  redeliveryFee: number;
  apa: number;
}): CharterBreakdown {
  const agentCommission = round2(input.grossPrice * CHARTER_AGENT_COMMISSION_RATE);
  const ourCommission = round2(input.grossPrice * CHARTER_OUR_COMMISSION_RATE);
  const totalCommission = round2(agentCommission + ourCommission);
  const netCharterPrice = round2(input.grossPrice - totalCommission);
  const vatOnGross = round2(input.grossPrice * input.vatRate);
  const vatOnOurCommission = round2(-ourCommission * CHARTER_COMMISSION_VAT_RATE);
  const netToOwner = round2(
    netCharterPrice + input.deliveryFee + input.redeliveryFee + input.apa + vatOnGross + vatOnOurCommission
  );
  return { agentCommission, ourCommission, totalCommission, netCharterPrice, vatOnGross, vatOnOurCommission, netToOwner };
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
