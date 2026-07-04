import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

function withinDateWindow(a: string, b: string, maxDays = 3) {
  const diffDays = Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  return diffDays <= maxDays;
}

function closeAmount(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, b * 0.05);
}

type LineMatch = { record_id: string; record_type: string; amount: number; date: string };

// Checks each parsed line against existing expenses/cash_transactions/
// incomes for this boat, regardless of whether they're already linked to
// some other bank statement line, so the preview can react before she
// ever imports instead of only revealing this after the fact:
// - "exact" (same amount, close date) - already fully accounted for.
// - "near" (same amount OR close date, not both) - probably the same
//   transaction with a typo on one side, worth a correction suggestion.
// - "none" - genuinely new.
async function matchLines(
  boatId: string,
  lines: { date: string; amount: number; line_type: string }[]
): Promise<{ status: "exact" | "near" | "none"; match?: LineMatch }[]> {
  const supabase = await createClient();
  const [{ data: expenses }, { data: cashTx }, { data: incomes }] = await Promise.all([
    supabase.from("expenses").select("id, amount, expense_date").eq("boat_id", boatId).in("payment_method", ["card", "bank_transfer"]),
    supabase.from("cash_transactions").select("id, amount, tx_date").eq("boat_id", boatId).eq("type", "withdrawal"),
    supabase.from("incomes").select("id, amount, income_date").eq("boat_id", boatId).eq("type", "actual"),
  ]);

  return lines.map((l) => {
    const pool =
      l.line_type === "expense"
        ? (expenses ?? []).map((e) => ({ record_id: e.id, record_type: "expense", amount: e.amount, date: e.expense_date ?? "" }))
        : l.line_type === "cash_withdrawal"
          ? (cashTx ?? []).map((c) => ({ record_id: c.id, record_type: "cash_withdrawal", amount: c.amount, date: c.tx_date }))
          : (incomes ?? []).map((i) => ({ record_id: i.id, record_type: "income", amount: i.amount, date: i.income_date }));

    const exact = pool.find((r) => r.date && r.amount === l.amount && withinDateWindow(r.date, l.date));
    if (exact) return { status: "exact" as const };

    const sameAmount = pool.find((r) => r.date && r.amount === l.amount);
    const sameDate = pool.find((r) => r.date && withinDateWindow(r.date, l.date) && closeAmount(r.amount, l.amount));
    const near = sameAmount ?? sameDate;
    if (near) return { status: "near" as const, match: near };

    return { status: "none" as const };
  });
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
  if (!SUPPORTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "פורמט קובץ לא נתמך" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const contentBlock =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

  const prompt = `You are reading a bank account statement (photo or PDF) for a boat expense-tracking app. Extract every transaction and classify it, responding with ONLY a raw JSON object (no markdown fences, no commentary):
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
List every transaction you can find, in the same order they appear in the statement. If the statement has no transactions, return an empty array.`;

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
        max_tokens: 8192,
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
      const matches = await matchLines(boatId, lines);
      const withMatches = lines.map((l, i) => ({ ...l, ...matches[i] }));
      exactCount = withMatches.filter((l) => l.status === "exact").length;
      parsed.lines = withMatches.filter((l) => l.status !== "exact");
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
