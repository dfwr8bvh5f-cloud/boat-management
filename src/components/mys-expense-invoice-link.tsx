"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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

// "Paid on their behalf": a button inside the expense EDIT form that attaches
// it to an invoice already issued to the same client (sent or paid), so the
// supplier payment, the invoice and the client's payment are connected. The
// server enforces the rules (still open, same client/boat, never more than the
// invoice bills in total); the amounts are shown here only for feedback.
export function MysExpenseInvoiceLink({
  link,
  t,
  pill = false,
}: {
  link: ExpenseInvoiceLink;
  // Render the trigger as the navy pill that sits in the Percent / Charge
  // price toggle row (same look as the new-expense form's invoice pill)
  // instead of a full-width button.
  pill?: boolean;
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
      {pill ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("mys_expense_invoice_link_cta")}
          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-fleet-navy px-2 py-1 text-white"
        >
          <span className="truncate">{link.attachedTo ? link.attachedTo.number : t("mys_expense_invoice_short")}</span>
        </button>
      ) : (
        <Button type="button" variant="primary" className="w-full justify-center" onClick={() => setOpen(true)}>
          {link.attachedTo ? t("mys_expense_invoice_attached_note", { number: link.attachedTo.number }) : t("mys_expense_invoice_link_cta")}
        </Button>
      )}
      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-fleet-navy">{t("mys_expense_invoice_link_title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="rounded-lg p-1 text-fleet-ink hover:bg-fleet-paper">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-fleet-ink">{t("mys_expense_invoice_link_hint")}</p>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

            <div className="flex flex-col gap-2 overflow-y-auto">
              {link.attachedTo ? (
                <div className="flex flex-col gap-2 rounded-lg border border-fleet-border p-2.5 text-sm text-fleet-navy">
                  <span className="min-w-0 truncate font-bold">{t("mys_expense_invoice_attached_note", { number: link.attachedTo.number })}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/mys/invoices/${link.attachedTo.invoiceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 items-center justify-center rounded-lg border border-fleet-border px-3 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
                    >
                      {t("mys_expense_invoice_open")}
                    </a>
                    {!link.viaLine && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        disabled={busy !== null}
                        loading={busy === "unlink"}
                        onClick={() => run("unlink", () => unlinkMysDebtFromInvoice(link.debt.kind, link.debt.id))}
                      >
                        {t("mys_debt_link_unlink")}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                link.options.map((o) => {
                  const fits = o.remaining >= link.debt.amount;
                  return (
                    <div key={o.id} className="flex flex-col gap-1 rounded-lg border border-fleet-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-fleet-navy">{o.number}</span>
                        <span dir="ltr" className="shrink-0 text-sm font-bold text-fleet-navy">
                          {formatCurrency(o.gross)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                        <span className={fits ? "" : "text-fleet-coral-text"}>
                          {fits
                            ? t("mys_expense_invoice_remaining", { amount: formatCurrency(o.remaining) })
                            : t("mys_expense_invoice_insufficient", { amount: formatCurrency(o.remaining) })}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="compact"
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
          </div>
        </Modal>
      )}
    </>
  );
}
