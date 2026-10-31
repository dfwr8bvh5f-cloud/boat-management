"use client";

import { useState } from "react";
import { FileBarChart, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button variant="secondary" size="compact" onClick={() => window.print()}>
        <Printer size={14} /> {t("export_print")}
      </Button>
      {isManagement && (
        <Button
          size="compact"
          loading={issuing}
          onClick={async () => {
            setIssuing(true);
            try {
              await issueFinancialReport(boatId, from, to, categoryFilter);
              setIssued(true);
            } finally {
              setIssuing(false);
            }
          }}
        >
          <FileBarChart size={14} /> {t("report_issue_button")}
        </Button>
      )}
      {issued && <span className="text-xs font-medium text-fleet-moss-text">{t("report_issued_success")}</span>}
    </div>
  );
}
