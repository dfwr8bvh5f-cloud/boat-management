import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";

export const runtime = "nodejs";
// A long statement (many pages/transactions) can genuinely take a while for
// the model to read through - the platform's default serverless timeout is
// short enough to cut that off mid-request, which surfaces to her as a
// generic "couldn't connect" failure even though nothing is actually broken.
export const maxDuration = 300;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const EXCEL_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function isExcelFile(file: File) {
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

type LineMatch = { record_id: string; record_type: string; amount: number; date: string; mismatch: "date" | "amount" | "cross_type" | "split" };
type ExistingRecord = { record_id: string; record_type: string; description: string; amount: number; date: string };
type PreviewStatus = "exact" | "review" | "new";

// Runs every scanned line through the deterministic reconciliation engine
// against everything already in the app for this boat (expenses,
// cash withdrawals, incomes - regardless of whether they're already linked
// to some other bank statement line), so the preview can react before she
// ever imports instead of only revealing this after the fact. AI produced
// the raw `lines` (it can only read text off the document); every status
// below is pure rule-based arithmetic, not an AI judgement call.
async function matchLines(
  boatId: string,
  lines: { date: string; amount: number; description: string; line_type: string }[]
): Promise<{
  lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number; isBankFee?: boolean }[];
  unmatchedExisting: ExistingRecord[];
}> {
  const supabase = await createClient();
  const [{ data: expenses }, { data: cashTx }, { data: incomes }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, description, amount, expense_date, payment_method")
      .eq("boat_id", boatId)
      .eq("status", "approved"),
    supabase.from("cash_transactions").select("id, notes, amount, tx_date").eq("boat_id", boatId).eq("status", "approved").eq("type", "withdrawal"),
    supabase.from("incomes").select("id, source, amount, income_date").eq("boat_id", boatId).eq("status", "approved").eq("type", "actual"),
  ]);

  const appItems: AppTxn[] = [
    ...(expenses ?? []).map((e) => ({
      id: `expense:${e.id}`,
      recordType: "expense" as ReconciliationRecordType,
      date: e.expense_date ?? "",
      amount: e.amount,
      currency: "EUR",
      paymentMethod: e.payment_method,
      description: e.description,
      isCashExcluded: e.payment_method === "cash",
    })),
    ...(cashTx ?? []).map((c) => ({
      id: `cash_withdrawal:${c.id}`,
      recordType: "cash_withdrawal" as ReconciliationRecordType,
      date: c.tx_date,
      amount: c.amount,
      currency: "EUR",
      description: c.notes ?? "",
    })),
    ...(incomes ?? []).map((i) => ({
      id: `income:${i.id}`,
      recordType: "income" as ReconciliationRecordType,
      date: i.income_date,
      amount: i.amount,
      currency: "EUR",
      description: i.source,
    })),
  ].filter((a) => a.date);

  // Two different date bounds, deliberately not the same:
  // - a PADDED range for the matching candidate pool - a bank line dated
  //   right at the edge of the statement may still genuinely correspond to
  //   an app record a few days beyond it (e.g. a card charge that posted
  //   just after month-end), so matching itself is allowed to look up to
  //   10 days either side.
  // - the EXACT (unpadded) statement span for deciding what's allowed to
  //   be reported as "missing" - an app record outside the statement's own
  //   dates was never going to be on it in the first place, so it must
  //   never be flagged as a gap just because it's a few days away. Padding
  //   only ever helps FIND a match; it never manufactures a false gap.
  const statementDates = lines.map((l) => l.date).sort();
  const exactMin = statementDates[0];
  const exactMax = statementDates[statementDates.length - 1];
  const padded = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const paddedMin = padded(exactMin, -10);
  const paddedMax = padded(exactMax, 10);
  const appItemsInRange = appItems.filter((a) => a.date >= paddedMin && a.date <= paddedMax);

  const bankItems: BankTxn[] = lines.map((l, i) => ({
    id: String(i),
    recordType: (l.line_type === "expense" || l.line_type === "cash_withdrawal" || l.line_type === "income"
      ? l.line_type
      : "expense") as ReconciliationRecordType,
    date: l.date,
    amount: l.amount,
    currency: "EUR",
    description: l.description ?? "",
  }));

  const results = reconcile(bankItems, appItemsInRange);

  const toRecord = (a: AppTxn): ExistingRecord => ({
    record_id: a.id.slice(a.id.indexOf(":") + 1),
    record_type: a.recordType,
    description: a.description,
    amount: a.amount,
    date: a.date,
  });

  const lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number; isBankFee?: boolean }[] = lines.map(() => ({
    status: "new",
  }));
  const unmatchedExisting: ExistingRecord[] = [];

  for (const r of results) {
    if (r.status === "excluded_cash") continue; // never surfaced in the scan preview

    if (r.bankItems.length === 0) {
      // missing_in_bank / possible_duplicate with no bank-side counterpart:
      // an existing app record with nothing corresponding to it on this
      // statement at all. Only ever reported when the record's own date
      // falls within the statement's exact span - one pulled in purely by
      // the padded matching window must not be shown as a false gap.
      if (r.status === "missing_in_bank" || r.status === "possible_duplicate") {
        for (const a of r.appItems) {
          if (a.date >= exactMin && a.date <= exactMax) unmatchedExisting.push(toRecord(a));
        }
      }
      continue;
    }

    const bankIdx = Number(r.bankItems[0].id);
    if (r.status === "matched") {
      lineResults[bankIdx] = { status: "exact" };
    } else if (r.status === "bank_fee") {
      lineResults[bankIdx] = { status: "new", isBankFee: true };
    } else if (r.status === "missing_in_app") {
      lineResults[bankIdx] = { status: "new" };
    } else if (r.status === "possible_split_match") {
      const first = r.appItems[0];
      lineResults[bankIdx] = {
        status: "review",
        matchCount: r.appItems.length,
        match: first ? { ...toRecord(first), mismatch: "split" } : undefined,
      };
    } else {
      // likely_match / needs_review, always exactly one bank + one app item
      const app = r.appItems[0];
      const mismatch: LineMatch["mismatch"] =
        app.recordType !== r.bankItems[0].recordType
          ? "cross_type"
          : round2Local(app.amount) !== round2Local(r.bankItems[0].amount)
            ? "amount"
            : "date";
      lineResults[bankIdx] = { status: "review", match: { ...toRecord(app), mismatch } };
    }
  }

  return { lineResults, unmatchedExisting };
}

function round2Local(n: number): number {
  return Math.round(n * 100) / 100;
}

// A negative amount is a cash withdrawal only if the description itself
// says so (ATM/withdrawal wording, in the languages her statements use) -
// otherwise every other negative amount is an ordinary expense. This is
// the only piece of the direction-classification that still reads the
// description at all, and it's a fixed keyword match, not a judgment call.
const CASH_WITHDRAWAL_PATTERN = /\bATM\b|cash\s*withdrawal|\bwithdrawal\b|משיכת\s*מזומן|כספומט|ΑΤΜ|ΑΝΑΛ[ΗΉ]ΨΗ|αναλ[ηή]ψη/i;

// Deterministic, rule-based classification of a signed amount into the
// app's line_type - never delegated to the AI, since a wrong income/
// expense call silently flips a transaction's direction. The AI's only
// job (in the prompt above) is to copy the amount with its correct sign
// off the statement; everything else here is fixed arithmetic.
function classifyLine(rawAmount: number, description: string): { line_type: "expense" | "cash_withdrawal" | "income"; amount: number } {
  if (rawAmount >= 0) return { line_type: "income", amount: round2Local(rawAmount) };
  const line_type = CASH_WITHDRAWAL_PATTERN.test(description) ? "cash_withdrawal" : "expense";
  return { line_type, amount: round2Local(Math.abs(rawAmount)) };
}

export async function POST(request: Request) {
  const profile = await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const boatId = String(formData.get("boat_id") ?? "");
  const statementName = String(formData.get("statement_name") ?? "").trim();
  const skipSave = formData.get("skip_save") === "1";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  const isExcel = isExcelFile(file);
  if (!SUPPORTED_TYPES.has(file.type) && !isExcel) {
    return NextResponse.json({ error: "פורמט קובץ לא נתמך" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Save the original file itself, not just the AI-extracted lines, so it
  // can be reopened later - the extracted data is only ever as good as
  // whatever the AI managed to read, but the source file is the ground
  // truth she may need to go back to. Best-effort: a storage hiccup here
  // must never block the actual scan she's waiting on. Skipped entirely
  // when re-scanning a statement that's already saved - it already has its
  // own storage object and bank_statement_files row, so saving again here
  // would just leave a duplicate copy behind.
  if (boatId && !skipSave) {
    try {
      const supabase = await createClient();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${boatId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from("bank-statements").upload(storagePath, bytes, {
        contentType: file.type || undefined,
      });
      if (!uploadError) {
        await supabase.from("bank_statement_files").insert({
          boat_id: boatId,
          file_path: storagePath,
          file_name: statementName || file.name,
          uploaded_by: profile.id,
        });
      }
    } catch (e) {
      console.error("scan-bank-statement: failed to archive uploaded file", e);
    }
  }

  let contentBlock: Record<string, unknown>;
  if (isExcel) {
    let csvText: string;
    try {
      csvText = excelToCsvText(bytes);
    } catch {
      return NextResponse.json({ error: "לא הצלחנו לקרוא את קובץ האקסל - ייתכן שהוא פגום" }, { status: 400 });
    }
    contentBlock = { type: "text", text: `Bank statement exported from Excel, as CSV:\n\n${csvText}` };
  } else {
    const base64 = bytes.toString("base64");
    contentBlock =
      file.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };
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
    return NextResponse.json({ error: "לא הצלחנו להתחבר לשירות הסריקה" }, { status: 502 });
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("scan-bank-statement: Anthropic API error", response.status, errBody.slice(0, 500));
    return NextResponse.json(
      { error: `שירות הסריקה החזיר שגיאה (${response.status}): ${errBody.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await response.json();
  const text: string | undefined = data?.content?.[0]?.text;
  if (!text) {
    console.error("scan-bank-statement: no text in response", JSON.stringify(data).slice(0, 500));
    return NextResponse.json(
      { error: "לא הצלחנו לזהות תנועות בקובץ (לא התקבלה תשובה מהמודל)" },
      { status: 200 }
    );
  }

  // The model sometimes wraps the JSON in markdown fences or adds a short
  // sentence before/after it despite being told not to - pull out the outer
  // {...} object instead of assuming the whole trimmed string is valid JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    console.error("scan-bank-statement: no JSON object found in text", text.slice(0, 500));
    return NextResponse.json(
      { error: `לא הצלחנו לזהות תנועות בקובץ - תגובת המודל: ${text.slice(0, 300)}` },
      { status: 200 }
    );
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const rawLines: { date: string; description: string; amount: number }[] = parsed?.lines ?? [];
    const lines = rawLines.map((l) => ({
      date: l.date,
      description: l.description,
      ...classifyLine(Number(l.amount) || 0, l.description ?? ""),
    }));
    let exactCount = 0;
    parsed.lines = lines;
    if (boatId && lines.length > 0) {
      const { lineResults, unmatchedExisting } = await matchLines(boatId, lines);
      const withMatches = lines.map((l, i) => ({ ...l, ...lineResults[i] }));
      exactCount = withMatches.filter((l) => l.status === "exact").length;
      parsed.lines = withMatches.filter((l) => l.status !== "exact");
      parsed.unmatched_existing = unmatchedExisting;
    }
    parsed.exact_match_count = exactCount;
    return NextResponse.json({ result: parsed });
  } catch (e) {
    // The model's own output got cut off before valid JSON closed - this
    // happens with long statements (many transaction lines) once the
    // response hits the token limit mid-array.
    if (data?.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "הקובץ מכיל יותר מדי תנועות לסריקה אחת - נסי להעלות תדפיס קצר יותר (למשל חצי חודש בכל פעם)" },
        { status: 200 }
      );
    }
    console.error("scan-bank-statement: JSON.parse failed", e, text.slice(0, 500));
    return NextResponse.json(
      { error: `לא הצלחנו לזהות תנועות בקובץ - תגובה לא תקינה: ${text.slice(0, 300)}` },
      { status: 200 }
    );
  }
}
