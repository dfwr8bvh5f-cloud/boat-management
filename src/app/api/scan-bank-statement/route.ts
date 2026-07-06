import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";

export const runtime = "nodejs";

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
  lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number }[];
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

  // Only consider app records that actually fall within the statement's own
  // date span - otherwise every approved expense ever entered for this
  // boat, however old or from an entirely different month's statement,
  // would get dumped into the "gap" list just because it never happened to
  // match one of today's scanned lines. No padding on purpose: a record
  // dated outside the statement it's being checked against genuinely
  // couldn't appear on it, so it shouldn't be flagged as missing from it.
  const statementDates = lines.map((l) => l.date).sort();
  const rangeMin = statementDates[0];
  const rangeMax = statementDates[statementDates.length - 1];
  const appItemsInRange = appItems.filter((a) => a.date >= rangeMin && a.date <= rangeMax);

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

  const lineResults: { status: PreviewStatus; match?: LineMatch; matchCount?: number }[] = lines.map(() => ({ status: "new" }));
  const unmatchedExisting: ExistingRecord[] = [];

  for (const r of results) {
    if (r.status === "excluded_cash") continue; // never surfaced in the scan preview

    if (r.bankItems.length === 0) {
      // missing_in_bank / possible_duplicate with no bank-side counterpart:
      // an existing app record with nothing corresponding to it on this
      // statement at all.
      if (r.status === "missing_in_bank" || r.status === "possible_duplicate") {
        for (const a of r.appItems) unmatchedExisting.push(toRecord(a));
      }
      continue;
    }

    const bankIdx = Number(r.bankItems[0].id);
    if (r.status === "matched") {
      lineResults[bankIdx] = { status: "exact" };
    } else if (r.status === "bank_fee" || r.status === "missing_in_app") {
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

export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const boatId = String(formData.get("boat_id") ?? "");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  const isExcel = isExcelFile(file);
  if (!SUPPORTED_TYPES.has(file.type) && !isExcel) {
    return NextResponse.json({ error: "פורמט קובץ לא נתמך" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

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

  const prompt = `You are reading a bank account statement (photo, PDF, or a CSV table exported from Excel) for a boat expense-tracking app. Extract every transaction and classify it, responding with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "lines": [
    {
      "date": string - the transaction date in YYYY-MM-DD format,
      "description": string - the transaction description/merchant/reference exactly as printed,
      "amount": number - the transaction amount, always positive, digits only (no currency symbol),
      "line_type": one of "expense" | "cash_withdrawal" | "income"
    }
  ]
}
Classification rules:
- "income": any incoming deposit/credit to the account.
- "cash_withdrawal": an outgoing ATM/cash withdrawal (money taken out as physical cash).
- "expense": any other outgoing transaction - card payment, bank transfer/payment to a supplier, direct debit, bank fee, etc.
IMPORTANT about dates: many bank statements print the value date only once as a header above a group of several transactions, without repeating it on every row below. Read carefully and give EACH transaction its own correct date - the date of the group it visually belongs to - rather than defaulting to the first date on the page for every line. If in doubt, re-check the layout before answering; it is a common mistake to accidentally stamp one single date onto all transactions.
IMPORTANT about amounts: copy every digit of the amount exactly as printed, including everything after the decimal point (cents) - never round, truncate, or approximate. Double-check each amount against the source before moving to the next line; a single mistyped digit turns into a real accounting error for her.
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
    const lines: { date: string; description: string; amount: number; line_type: string }[] = parsed?.lines ?? [];
    let exactCount = 0;
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
