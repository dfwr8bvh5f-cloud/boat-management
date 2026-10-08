"use client";

import { useState } from "react";
import { FileBarChart, Printer } from "lucide-react";
import { issueFinancialReport } from "@/lib/actions/reports";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ExpenseCategory } from "@/lib/types/database";

export function ReportActions({
  boatId,
  from,
  to,
  categoryFilter,
  isManagement,
  locale,
}: {
  boatId: string;
  from: string;
  to: string;
  // Whatever the live page's own category filter is currently narrowed to
  // (see finance/report/page.tsx) - issuing a report freezes it into the
  // saved snapshot exactly as shown, same as from/to already do.
  categoryFilter?: ExpenseCategory[];
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
      >
        <Printer size={14} /> {t("export_print")}
      </button>
      {isManagement && (
        <button
          type="button"
          disabled={issuing}
          onClick={async () => {
            setIssuing(true);
            try {
              await issueFinancialReport(boatId, from, to, categoryFilter);
              setIssued(true);
            } finally {
              setIssuing(false);
            }
          }}
          className="flex items-center gap-1.5 rounded-full bg-fleet-teal px-3.5 py-1.5 text-xs font-bold text-white transition-transform hover:opacity-90 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
        >
          <FileBarChart size={14} /> {t("report_issue_button")}
        </button>
      )}
      {issued && <span className="text-xs font-medium text-fleet-moss-text">{t("report_issued_success")}</span>}
    </div>
  );
}
