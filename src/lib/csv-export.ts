// Shared by every client-side "export to Excel" button (expenses, incomes,
// cash transactions) - builds a UTF-8 CSV (with BOM, so Excel opens Hebrew
// text correctly) and triggers a browser download.
export function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv =
    "﻿" +
    [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
