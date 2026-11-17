"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { linkMysDebtsToInvoice, unlinkMysDebtFromInvoice } from "@/lib/actions/mys";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/money";
import type { translate } from "@/lib/i18n/translate";

export type ExpenseInvoiceOption = { id: string; number: string; status: string; gross: number; remaining: number };
export type ExpenseInvoiceLink = {
  debt: { kind: "charge" | "ad_hoc"; id: string; amount: number };
  attachedTo: { invoiceId: string; number: string } | null;
  // Attached through an invoice line: released by editing/voiding the invoice.
  viaLine: boolean;
  // Issued (sent/paid) invoices of the same client/boat, with what is left on each.
  options: ExpenseInvoiceOption[];
};

// "Paid on their behalf": a button on a client-billed MYS expense that attaches
// it to an invoice already issued to the same client (sent or paid), so the
// supplier payment, the invoice and the client's payment are connected. The
// server enforces the rules (still open, same client/boat, never more than the
// invoice bills in total); the amounts are shown here only for feedback.
export function MysExpenseInvoiceLink({
  link,
  t,
}: {
  link: ExpenseInvoiceLink;
  t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!link.attachedTo && link.options.length === 0) return null;

  const run = async (key: string, fn: () => Promise<{ error: string } | undefined>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(actionErrorMessage(err, t("mys_link_line_failed")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("mys_expense_invoice_link_cta")}
        title={t("mys_expense_invoice_link_cta")}
        className={`flex h-8 w-8 items-center justify-center hover:text-fleet-navy ${link.attachedTo ? "text-fleet-teal" : "text-fleet-ink"}`}
      >
        <Link2 size={14} className="h-3.5 w-3.5" />
      </button>
      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-fleet-navy">{t("mys_expense_invoice_link_title")}</h2>
                <p className="text-xs text-fleet-ink">{t("mys_expense_invoice_link_hint")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="text-fleet-ink hover:text-fleet-navy">
                <X size={16} />
              </button>
            </div>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

            {link.attachedTo ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper p-2.5 text-xs text-fleet-ink">
                <span className="min-w-0 truncate">{t("mys_expense_invoice_attached_note", { number: link.attachedTo.number })}</span>
                {!link.viaLine && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    loading={busy === "unlink"}
                    onClick={() => run("unlink", () => unlinkMysDebtFromInvoice(link.debt.kind, link.debt.id))}
                  >
                    {t("mys_debt_link_unlink")}
                  </Button>
                )}
              </div>
            ) : (
              link.options.map((o) => {
                const fits = o.remaining >= link.debt.amount;
                return (
                  <div key={o.id} className="flex flex-col gap-1 rounded-lg bg-fleet-paper p-2.5 text-xs text-fleet-ink">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-bold text-fleet-navy">{o.number}</span>
                      <span dir="ltr" className="shrink-0 font-bold text-fleet-navy">
                        {formatCurrency(o.gross)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={fits ? "" : "text-fleet-coral-text"}>
                        {fits
                          ? t("mys_expense_invoice_remaining", { amount: formatCurrency(o.remaining) })
                          : t("mys_expense_invoice_insufficient", { amount: formatCurrency(o.remaining) })}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!fits || busy !== null}
                        loading={busy === o.id}
                        onClick={() => run(o.id, () => linkMysDebtsToInvoice(o.id, [{ kind: link.debt.kind, id: link.debt.id }]))}
                      >
                        {t("mys_expense_invoice_action")}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
