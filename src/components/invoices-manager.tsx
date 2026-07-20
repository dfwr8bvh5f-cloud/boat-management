"use client";

import { useState } from "react";
import JSZip from "jszip";
import { CheckCircle2, Eye, FileText, X } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-format";
import { isPdfUrl } from "@/lib/upload";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Expense, ExpenseCategory } from "@/lib/types/database";

type InvoiceWithUrl = Expense & { receiptUrl: string | null };

export function InvoicesManager({
  invoices,
  categoryLabels,
  locale,
}: {
  invoices: InvoiceWithUrl[];
  categoryLabels: Record<ExpenseCategory, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const allSelected = invoices.length > 0 && selected.size === invoices.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(invoices.map((e) => e.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const downloadSelected = async () => {
    const targets = invoices.filter((e) => selected.has(e.id) && e.receiptUrl);
    if (targets.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      await Promise.all(
        targets.map(async (e) => {
          const url = e.receiptUrl as string;
          const res = await fetch(url);
          const blob = await res.blob();
          const ext = isPdfUrl(url) ? "pdf" : url.split("?")[0].split(".").pop() || "jpg";
          const base = `${e.expense_date ?? ""}_${e.description}`.replace(/[^\w.\-]+/g, "_").slice(0, 80) || e.id;
          let name = `${base}.${ext}`;
          let i = 2;
          while (usedNames.has(name)) {
            name = `${base}_${i}.${ext}`;
            i++;
          }
          usedNames.add(name);
          zip.file(name, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "invoices.zip";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {invoices.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
          <label className="flex items-center gap-1.5 text-xs font-bold text-fleet-ink">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-fleet-teal" />
            {t("select_all_word")}
          </label>
          <button
            type="button"
            onClick={downloadSelected}
            disabled={selected.size === 0 || downloading}
            className="flex items-center gap-1.5 rounded-full bg-fleet-navy px-3 py-1.5 text-xs font-bold text-fleet-paper disabled:opacity-40"
          >
            {downloading ? t("downloading_word") : `${t("download_invoice_files")} (${selected.size})`}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {invoices.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-dotted border-fleet-border pb-2">
            <input
              type="checkbox"
              checked={selected.has(e.id)}
              onChange={() => toggleOne(e.id)}
              aria-label={e.description}
              className="h-4 w-4 shrink-0 accent-fleet-teal print:hidden"
            />
            {e.receiptUrl && (
              <button
                type="button"
                onClick={() => setLightboxUrl(e.receiptUrl)}
                aria-label={t("view_receipt")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white print:hidden"
              >
                {isPdfUrl(e.receiptUrl) ? <FileText size={16} /> : <Eye size={16} />}
              </button>
            )}
            <div className="flex-1">
              <div className="text-sm">
                {e.description}
                {e.invoice_number ? ` · #${e.invoice_number}` : ""}
              </div>
              <div className="text-xs text-fleet-ink">
                {e.category ? categoryLabels[e.category] : t("not_set_yet")} · <span dir="ltr">{e.expense_date ? formatDateDisplay(e.expense_date) : ""}</span>
              </div>
            </div>
            <div className="font-bold text-fleet-navy">{formatCurrency(e.amount)}</div>
          </div>
        ))}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:hidden"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label={t("close_word")}
            className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy"
          >
            <X size={18} />
          </button>
          {isPdfUrl(lightboxUrl) ? (
            <iframe src={`${lightboxUrl}#view=FitH`} title="invoice" className="h-[85vh] w-[90vw] rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
      {downloading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-fleet-navy shadow-lg">
            <CheckCircle2 size={16} className="animate-pulse text-fleet-teal" /> {t("downloading_word")}
          </div>
        </div>
      )}
    </>
  );
}
