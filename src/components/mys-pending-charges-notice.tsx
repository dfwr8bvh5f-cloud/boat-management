import Link from "next/link";
import { Hourglass } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import { formatCurrency } from "@/lib/money";
import { formatDateDisplay } from "@/lib/date-format";
import type { Locale } from "@/lib/i18n/dictionaries";

const MAX_ROWS = 8;

export type PendingCharge = {
  id: string;
  boatName: string;
  description: string;
  amount: number;
  date: string | null;
};

// Read-only heads-up on /mys/debts: a management-paid expense marked to bill
// MYS only becomes a debt once it's approved, so until then it appeared
// nowhere in MYS - the manager couldn't tell what was about to become
// billable or what was stuck waiting on an approval. Not selectable for an
// invoice on purpose; approving it (on /approvals) is what promotes it.
export function MysPendingChargesNotice({ rows, locale }: { rows: PendingCharge[]; locale: Locale }) {
  if (rows.length === 0) return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const shown = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - shown.length;

  return (
    <details className="rounded-xl border border-fleet-brass bg-white">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
        <Hourglass size={16} className="shrink-0 text-fleet-brass" />
        <span className="font-bold text-fleet-navy">
          {t("mys_pending_charges_title")} ({rows.length})
        </span>
        <span className="tabular-nums text-fleet-ink" dir="ltr">
          {formatCurrency(total)}
        </span>
        <Link href="/approvals" className="ms-auto text-xs font-medium text-fleet-teal hover:underline">
          {t("mys_pending_charges_cta")} ›
        </Link>
      </summary>
      <div className="border-t border-fleet-border px-3 py-2">
        <p className="mb-2 text-xs text-fleet-ink">{t("mys_pending_charges_hint")}</p>
        <ul className="flex flex-col gap-1">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 border-b border-dotted border-fleet-border py-1 text-sm last:border-0">
              <span className="min-w-0 truncate">
                <span className="font-medium text-fleet-navy">{r.boatName}</span>
                <span className="text-fleet-ink"> · {r.description}</span>
                {r.date && <span className="text-2xs text-fleet-ink/70"> · {formatDateDisplay(r.date)}</span>}
              </span>
              <span className="shrink-0 tabular-nums" dir="ltr">
                {formatCurrency(r.amount)}
              </span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <p className="mt-1 text-xs text-fleet-ink">
            +{hidden} {t("mys_pending_charges_more")}
          </p>
        )}
      </div>
    </details>
  );
}
