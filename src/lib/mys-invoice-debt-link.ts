// One paid client invoice can cover several supplier payments MYS made on the
// client's behalf (the invoice is higher than their sum: markup, fees, VAT).
// Attaching such payments to an invoice is only allowed while the payments
// together never exceed what the invoice bills - a deterministic guard, no
// guessing about which payment "belongs" to which line.
const round2 = (n: number) => Math.round(n * 100) / 100;

export type DebtAttachCheck = { ok: boolean; invoiceGross: number; attached: number; remaining: number };

export function checkDebtsFitInvoice(input: {
  invoiceAmount: number;
  invoiceVat: number;
  alreadyAttached: number;
  selected: number;
}): DebtAttachCheck {
  const invoiceGross = round2(input.invoiceAmount + input.invoiceVat);
  const attached = round2(input.alreadyAttached + input.selected);
  const remaining = round2(invoiceGross - attached);
  return { ok: input.selected > 0 && remaining >= 0, invoiceGross, attached, remaining };
}

// Open debts that may be attached to this invoice: same boat (expense-backed
// debt) or same client name (ad-hoc charge). Amounts are NOT matched - they
// differ on purpose (the invoice is higher).
export function debtsForInvoice<T extends { kind: "charge" | "ad_hoc"; boatId: string | null; clientName: string | null }>(
  invoice: { boat_id: string | null; client_name: string },
  debts: T[]
): T[] {
  const client = invoice.client_name.trim().toLowerCase();
  return debts.filter((d) =>
    d.kind === "charge" ? d.boatId !== null && d.boatId === invoice.boat_id : (d.clientName ?? "").trim().toLowerCase() === client
  );
}

// Invoices that have at least one supplier payment attached DIRECTLY (not
// through one of their own lines - those payments are the line's own source).
// For such an invoice the client's payment is already accounted for by the
// attached payments (the invoice being higher is MYS's markup/fees), so its
// "advance" lines must not also count as client credit on /mys/debts.
export function invoicesWithDirectDebts(
  attached: { invoiceId: string; debtId: string }[],
  lineSourceIds: Set<string>
): Set<string> {
  const out = new Set<string>();
  for (const a of attached) if (!lineSourceIds.has(a.debtId)) out.add(a.invoiceId);
  return out;
}
