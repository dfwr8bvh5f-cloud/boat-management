"use client";

import { useState } from "react";
import { Download, FileBarChart, Printer } from "lucide-react";
import { issueFinancialReport } from "@/lib/actions/reports";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

export function ReportActions({
  boatId,
  from,
  to,
  csvRows,
  isManagement,
  locale,
}: {
  boatId: string;
  from: string;
  to: string;
  csvRows: { date: string; description: string; category: string; paidWith: string; amount: number }[];
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);

  const downloadCsv = () => {
    const header = [t("date"), t("description"), t("report_type_of_expense"), t("report_paid_with"), t("amount")];
    const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = csvRows.map((r) =>
      [r.date, r.description, r.category, r.paidWith, String(r.amount)].map(csvEscape).join(","),
    );
    const csv = "﻿" + [header.map(csvEscape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report_${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={downloadCsv}
        className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
      >
        <Download size={13} /> {t("report_download_csv")}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
      >
        <Printer size={13} /> {t("export_print")}
      </button>
      {isManagement && (
        <button
          type="button"
          disabled={issuing}
          onClick={async () => {
            setIssuing(true);
            try {
              await issueFinancialReport(boatId, from, to);
              setIssued(true);
            } finally {
              setIssuing(false);
            }
          }}
          className="flex items-center gap-1.5 rounded-full bg-fleet-teal px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          <FileBarChart size={13} /> {t("report_issue_button")}
        </button>
      )}
      {issued && <span className="text-xs font-medium text-fleet-moss">{t("report_issued_success")}</span>}
    </div>
  );
}
