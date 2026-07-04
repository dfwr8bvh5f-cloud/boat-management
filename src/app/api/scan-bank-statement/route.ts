import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת תדפיסים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
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
