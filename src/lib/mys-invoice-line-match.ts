import type { MysInvoiceLine } from "@/lib/types/database";

export type OpenDebtForLink = {
  kind: "charge" | "ad_hoc";
  id: string;
  // boat_id for an expense-backed debt, client name for an ad-hoc charge -
  // matched against the invoice's own boat/client below.
  boatId: string | null;
  clientName: string | null;
  description: string;
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Only debts that belong to this invoice's boat/client AND whose amount
// equals the line's amount to the cent are ever offered - the server
// re-checks the same rule, nothing here is a guess.
export function candidatesForLine(
  line: Pick<MysInvoiceLine, "amount" | "vat_amount">,
  invoice: { boat_id: string | null; client_name: string },
  debts: OpenDebtForLink[]
) {
  // A debt's amount is what MYS paid, so it matches the line's net amount
  // (lines built from debts) or its gross amount incl. VAT (a manually-typed
  // line billing that same cost plus VAT) - to the cent, nothing fuzzier.
  const amounts = [round2(line.amount), round2(line.amount + line.vat_amount)];
  return debts.filter(
    (d) =>
      amounts.includes(round2(d.amount)) &&
      (d.kind === "charge"
        ? d.boatId !== null && d.boatId === invoice.boat_id
        : (d.clientName ?? "").trim().toLowerCase() === invoice.client_name.trim().toLowerCase())
  );
}
