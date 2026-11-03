"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { linkMysInvoiceLineToDebt, setMysInvoiceLineAdvance } from "@/lib/actions/mys";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysInvoiceLine } from "@/lib/types/database";
import { candidatesForLine, type OpenDebtForLink } from "@/lib/mys-invoice-line-match";

export function MysInvoiceLineLink({
  invoice,
  lines,
  debts,
  locale,
}: {
  invoice: { boat_id: string | null; client_name: string; status: string };
  lines: MysInvoiceLine[];
  debts: OpenDebtForLink[];
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On a paid invoice every unlinked line can also be marked as an advance
  // (money received before its cost exists); on any invoice a line with an
  // exact-amount open debt can be linked.
  const canAdvance = invoice.status === "paid";
  const linkable = lines
    .filter((l) => !l.source_type && !l.source_id)
    .map((l) => ({ line: l, candidates: candidatesForLine(l, invoice, debts) }))
    .filter((x) => x.candidates.length > 0 || canAdvance);
  if (linkable.length === 0) return null;

  const doAdvance = async (line: MysInvoiceLine) => {
    setBusyKey(`${line.id}:advance`);
    setError(null);
    try {
      const res = await setMysInvoiceLineAdvance(line.id, !line.is_advance);
      if (res?.error) setError(res.error);
      else startTransition(() => router.refresh());
    } catch (err) {
      setError(actionErrorMessage(err, t("mys_link_line_failed")));
    } finally {
      setBusyKey(null);
    }
  };

  const doLink = async (lineId: string, d: OpenDebtForLink) => {
    const key = `${lineId}:${d.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await linkMysInvoiceLineToDebt(lineId, d.kind, d.id);
      if (res?.error) setError(res.error);
      else startTransition(() => router.refresh());
    } catch (err) {
      setError(actionErrorMessage(err, t("mys_link_line_failed")));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("mys_link_line_cta")}
        title={t("mys_link_line_cta")}
        className="flex h-9 w-9 shrink-0 items-center justify-center text-fleet-brass hover:text-fleet-navy"
      >
        <Link2 size={16} />
      </button>
      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-fleet-navy">{t("mys_link_line_title")}</h2>
                <p className="text-xs text-fleet-ink">{t("mys_link_line_hint")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="text-fleet-ink hover:text-fleet-navy">
                <X size={16} />
              </button>
            </div>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
            {linkable.map(({ line, candidates }) => (
              <div key={line.id} className="flex flex-col gap-1.5 rounded-lg bg-fleet-paper p-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{line.description}</span>
                  <span dir="ltr" className="shrink-0 font-bold text-fleet-navy">
                    {formatCurrency(line.amount)}
                  </span>
                </div>
                {canAdvance && (
                  <div className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                    <span className="min-w-0 truncate">
                      {line.is_advance ? t("mys_line_advance_on") : t("mys_line_advance_hint")}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyKey !== null}
                      loading={busyKey === `${line.id}:advance`}
                      onClick={() => doAdvance(line)}
                    >
                      {line.is_advance ? t("mys_line_advance_remove") : t("mys_line_advance_mark")}
                    </Button>
                  </div>
                )}
                {candidates.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-xs text-fleet-ink">
                    <span className="min-w-0 truncate">{d.description}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyKey !== null}
                      loading={busyKey === `${line.id}:${d.id}`}
                      onClick={() => doLink(line.id, d)}
                    >
                      {t("mys_link_line_action")}
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
