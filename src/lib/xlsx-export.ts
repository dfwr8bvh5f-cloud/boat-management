"use client";

// Builds and downloads a real .xlsx workbook instead of a text CSV, so
// every field lands in its own cell no matter how the viewer's copy of
// Excel is configured - a plain comma-delimited CSV can collapse into a
// single column when the machine's regional list separator isn't a comma
// (common on Hebrew/European Windows installs), which a native XLSX binary
// sidesteps entirely since it has no delimiter to get wrong. Loaded lazily
// (dynamic import) since the "xlsx" library (already a dependency, used
// server-side for bank statement parsing - see src/lib/bank-statement-ocr.ts)
// is sizeable and only ever needed once someone actually clicks an export
// button.
export async function downloadXlsx(filename: string, header: string[], rows: (string | number)[][]) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename);
}
