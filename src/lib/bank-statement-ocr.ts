import "server-only";
import * as XLSX from "xlsx";
import { classifyLine } from "@/lib/bank-statement-classify";
import { extractPdfBytes } from "@/lib/pdf-sanitize";
import type { BankStmtLineType, PaymentMethod } from "@/lib/types/database";

// Shared by both bank-statement scan routes (boat-scoped and MYS's own) -
// this half of the original scan-bank-statement route was already boat-
// agnostic (file handling + the AI OCR call + deterministic classification),
// only the matching-against-the-app-database step that used to follow it
// stays route-specific. Extracted so a second, MYS-scoped route doesn't
// duplicate ~130 lines of OCR/prompt code - see src/app/api/scan-bank-statement/route.ts
// (boats) and src/app/api/scan-mys-bank-statement/route.ts (MYS).

export const SUPPORTED_STATEMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const EXCEL_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export function isExcelStatementFile(file: File) {
  return EXCEL_TYPES.has(file.type) || /\.(xlsx|xls)$/i.test(file.name);
}

// Excel bank exports vary wildly in column layout across banks, so instead
// of trying to parse columns ourselves, every sheet is flattened to CSV
// text and handed to the same AI extraction prompt used for photos/PDFs -
// it's just as capable of reading a table as a scanned image.
//
// rawNumbers is essential here: without it, a cell formatted with a
// comma decimal separator (e.g. a European-locale amount like "3,13")
// gets written out with that literal comma - which a CSV parser reads as
// a column break, silently corrupting that row into extra fields and
// causing the AI to drop or misread the transaction entirely.
// forceQuotes guards the same way against a description that happens to
// contain a comma.
function excelToCsvText(bytes: Buffer): string {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  return workbook.SheetNames.map((name) =>
    XLSX.utils.sheet_to_csv(workbook.Sheets[name], { rawNumbers: true, forceQuotes: true })
  ).join("\n\n");
}

export type ClassifiedStatementLine = {
  date: string;
  description: string;
  amount: number;
  line_type: BankStmtLineType;
  payment_method?: PaymentMethod;
};

export type ExtractBankStatementLinesResult = { lines: ClassifiedStatementLine[] } | { error: string; status: number };

// Reads a bank statement file (image/PDF/Excel), OCRs it via the Anthropic
// API, and deterministically classifies each line (see classifyLine,
// bank-statement-classify.ts) - never lets the AI itself decide direction/
// type, only extraction. Caller has already validated the file type and
// read its bytes (needed both here and, for the boat route, to also archive
// the original file to storage) - `fileType`/`fileName` are only used to
// decide the Excel-vs-image/PDF path and content-type for the API call.
export async function extractBankStatementLines(
  bytes: Buffer,
  fileType: string,
  isExcel: boolean
): Promise<ExtractBankStatementLinesResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)", status: 501 };
  }

  let contentBlock: Record<string, unknown>;
  if (isExcel) {
    let csvText: string;
    try {
      csvText = excelToCsvText(bytes);
    } catch {
      return { error: "לא הצלחנו לקרוא את קובץ האקסל - ייתכן שהוא פגום", status: 400 };
    }
    contentBlock = { type: "text", text: `Bank statement exported from Excel, as CSV:\n\n${csvText}` };
  } else {
    // Some e-invoicing/e-document portals export a "PDF" that's actually an
    // HTML page with the real PDF bytes glued inside - opens fine in any
    // desktop viewer, but a strict parser like Anthropic's rejects it
    // outright. Strip the wrapper for the copy sent to the AI; any archived
    // copy the caller keeps in storage stays byte-for-byte as downloaded.
    const scanBytes = fileType === "application/pdf" ? extractPdfBytes(bytes) : bytes;
    const base64 = scanBytes.toString("base64");
    contentBlock =
      fileType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: fileType, data: base64 } };
  }

  // Whether a line is money in or money out is never left to the model's
  // judgment of the wording - a refund/reversal of a card purchase reads
  // almost identically to the purchase itself ("card purchase reversal"
  // still mentions "card purchase"), so classifying by description alone
  // is exactly the kind of guess this app's rules forbid for anything that
  // decides where a transaction lands financially. The model's only job
  // here is OCR: copy the amount exactly as printed, sign included, off
  // whatever column/format the statement uses for debits vs credits.
  // classifyLine() below turns that signed number into expense/income/
  // cash_withdrawal deterministically - a positive amount is always income,
  // a negative one is a cash withdrawal only if the description matches a
  // fixed ATM/withdrawal pattern, expense otherwise.
  const prompt = `You are reading a bank account statement (photo, PDF, or a CSV table exported from Excel) for a boat expense-tracking app. Extract every transaction, responding with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "lines": [
    {
      "date": string - the transaction date in YYYY-MM-DD format,
      "description": string - the transaction description/merchant/reference exactly as printed,
      "category": string or null - if the statement has its OWN separate category/type column (e.g. a Greek "Κατηγορία" column showing things like "ΑΓΟΡΑ ΜΕ ΚΑΡΤΑ", "ΑΤΜ-ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ", "ΜΕΤΑΦΟΡΑ ΣΕ ΛΟΓ.ΤΡΙΤΟΥ", or an English "Type"/"Transaction Type" column), copy that column's value for this row verbatim. If the statement has no such column at all, use null - never invent or guess one from the description.
      "amount": number - the transaction amount WITH ITS SIGN exactly as it represents money leaving or entering the account: negative for a debit (money leaving - a purchase, transfer out, fee, withdrawal), positive for a credit (money entering - a deposit, incoming transfer, refund/reversal of an earlier purchase). Do not guess the sign from what the line is worded as - read it directly from the statement's own layout (a "-" prefix, a debit/credit column, a Χρέωση/Πίστωση column, red vs black text, etc). A refund or reversal of a card purchase is still a positive/credit amount even though its description mentions a purchase.
    }
  ]
}
IMPORTANT about dates: many bank statements print the value date only once as a header above a group of several transactions, without repeating it on every row below. Read carefully and give EACH transaction its own correct date - the date of the group it visually belongs to - rather than defaulting to the first date on the page for every line. If in doubt, re-check the layout before answering; it is a common mistake to accidentally stamp one single date onto all transactions.
IMPORTANT about amounts: copy every digit of the amount exactly as printed, including everything after the decimal point (cents) - never round, truncate, or approximate. Double-check each amount and its sign against the source before moving to the next line; a single mistyped digit or flipped sign turns into a real accounting error for her.
This statement may be long - list EVERY transaction you can find, however many there are, in the same order they appear in the statement. Do not stop early or summarize; completeness and exact order matter more than brevity. If the statement has no transactions, return an empty array.`;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60000,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });
  } catch {
    return { error: "לא הצלחנו להתחבר לשירות הסריקה", status: 502 };
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("bank-statement-ocr: Anthropic API error", response.status, errBody.slice(0, 500));
    return { error: `שירות הסריקה החזיר שגיאה (${response.status}): ${errBody.slice(0, 300)}`, status: 502 };
  }

  const data = await response.json();
  const text: string | undefined = data?.content?.[0]?.text;
  if (!text) {
    console.error("bank-statement-ocr: no text in response", JSON.stringify(data).slice(0, 500));
    return { error: "לא הצלחנו לזהות תנועות בקובץ (לא התקבלה תשובה מהמודל)", status: 200 };
  }

  // The model sometimes wraps the JSON in markdown fences or adds a short
  // sentence before/after it despite being told not to - pull out the outer
  // {...} object instead of assuming the whole trimmed string is valid JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    console.error("bank-statement-ocr: no JSON object found in text", text.slice(0, 500));
    return { error: `לא הצלחנו לזהות תנועות בקובץ - תגובת המודל: ${text.slice(0, 300)}`, status: 200 };
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const rawLines: { date: string; description: string; amount: number; category?: string | null }[] = parsed?.lines ?? [];
    const lines = rawLines.map((l) => ({
      date: l.date,
      description: l.description,
      ...classifyLine(Number(l.amount) || 0, l.description ?? "", l.category),
    }));
    return { lines };
  } catch (e) {
    // The model's own output got cut off before valid JSON closed - this
    // happens with long statements (many transaction lines) once the
    // response hits the token limit mid-array.
    if (data?.stop_reason === "max_tokens") {
      return { error: "הקובץ מכיל יותר מדי תנועות לסריקה אחת - נסי להעלות תדפיס קצר יותר (למשל חצי חודש בכל פעם)", status: 200 };
    }
    console.error("bank-statement-ocr: JSON.parse failed", e, text.slice(0, 500));
    return { error: `לא הצלחנו לזהות תנועות בקובץ - תגובה לא תקינה: ${text.slice(0, 300)}`, status: 200 };
  }
}
