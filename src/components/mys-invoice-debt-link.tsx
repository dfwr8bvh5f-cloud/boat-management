"use client";

import { CloseButton } from "@/components/close-button";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { linkMysDebtsToInvoice, unlinkMysDebtFromInvoice } from "@/lib/actions/mys";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { OpenDebtForLink } from "@/lib/mys-invoice-line-match";
import { checkDebtsFitInvoice, debtsForInvoice } from "@/lib/mys-invoice-debt-link";

export type LinkedDebt = { kind: "charge" | "ad_hoc"; id: string; description: string; amount: number; viaLine: boolean };

// One client payment / one invoice can cover several supplier payments MYS
// made for the client: pick the open ones that belong to this invoice. The
// invoice is higher than their sum, so amounts are not matched - the only
// rule is that together they never exceed the invoice (checked here for
// feedback and again on the server).
export function MysInvoiceDebtLink({
  invoice,
  debts,
  linked,
  locale,
}: {
  invoice: { id: string; boat_id: string | null; client_name: string; status: string; amount: number; vat_amount: number };
  debts: OpenDebtForLink[];
  linked: LinkedDebt[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => debtsForInvoice(invoice, debts), [invoice, debts]);
  const alreadyAttached = linked.reduce((s, d) => s + d.amount, 0);
  const selectedTotal = candidates.filter((d) => selected.has(`${d.kind}:${d.id}`)).reduce((s, d) => s + d.amount, 0);
  const check = checkDebtsFitInvoice({
    invoiceAmount: invoice.amount,
    invoiceVat: invoice.vat_amount ?? 0,
    alreadyAttached,
    selected: selectedTotal,
  });

  if (invoice.status !== "sent" && invoice.status !== "paid") return null;
  if (candidates.length === 0 && linked.length === 0) return null;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async (key: string, fn: () => Promise<{ error: string } | undefined>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res?.error) setError(res.error);
      else {
        setSelected(new Set());
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
        aria-label={t("mys_debt_link_cta")}
        title={t("mys_debt_link_cta")}
        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-brass hover:text-fleet-navy"
      >
        <Link2 size={16} />
      </button>
      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-fleet-navy">{t("mys_debt_link_title")}</h2>
              <CloseButton label={t("close_word")} onClick={() => setOpen(false)} />
            </div>
            <p className="text-sm text-fleet-ink">{t("mys_debt_link_hint")}</p>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

            {linked.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-border p-2.5">
                <div className="text-2xs font-bold text-fleet-ink">{t("mys_debt_link_attached")}</div>
                {linked.map((d) => (
                  <div key={`${d.kind}:${d.id}`} className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                    <span className="min-w-0 truncate">{d.description}</span>
                    <span dir="ltr" className="shrink-0 font-bold text-fleet-navy">
                      {formatCurrency(d.amount)}
                    </span>
                    {!d.viaLine && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy !== null}
                        loading={busy === `un:${d.id}`}
                        onClick={() => run(`un:${d.id}`, () => unlinkMysDebtFromInvoice(d.kind, d.id))}
                      >
                        {t("mys_debt_link_unlink")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {candidates.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-fleet-border p-2.5">
                {candidates.map((d) => {
                  const key = `${d.kind}:${d.id}`;
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs text-fleet-ink">
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} className="h-4 w-4 shrink-0 rounded border-fleet-border" />
                      <span className="min-w-0 flex-1 truncate">{d.description}</span>
                      <span dir="ltr" className="shrink-0 font-bold text-fleet-navy">
                        {formatCurrency(d.amount)}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-fleet-ink">{t("mys_debt_link_none")}</p>
            )}

            <div className="flex flex-col gap-0.5 text-xs text-fleet-ink">
              <div className="flex justify-between">
                <span>{t("mys_debt_link_invoice_total")}</span>
                <span dir="ltr" className="font-bold text-fleet-navy">{formatCurrency(check.invoiceGross)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("mys_debt_link_attached_total")}</span>
                <span dir="ltr" className="font-bold text-fleet-navy">{formatCurrency(check.attached)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("mys_debt_link_remaining")}</span>
                <span dir="ltr" className={`font-bold ${check.remaining < 0 ? "text-fleet-coral-text" : "text-fleet-navy"}`}>
                  {formatCurrency(check.remaining)}
                </span>
              </div>
              {check.remaining < 0 && <p className="mt-1 text-fleet-coral-text">{t("mys_debt_link_exceeds")}</p>}
            </div>

            {candidates.length > 0 && (
              <Button
                type="button"
                variant="primary"
                disabled={!check.ok || busy !== null}
                loading={busy === "link"}
                onClick={() =>
                  run("link", () =>
                    linkMysDebtsToInvoice(
                      invoice.id,
                      candidates.filter((d) => selected.has(`${d.kind}:${d.id}`)).map((d) => ({ kind: d.kind, id: d.id }))
                    )
                  )
                }
              >
                {t("mys_debt_link_action")}
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
