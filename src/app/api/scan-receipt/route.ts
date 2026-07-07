import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/labels";

export const runtime = "nodejs";
export const maxDuration = 300;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת חשבוניות לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (!SUPPORTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "פורמט תמונה לא נתמך" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const contentBlock =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

  const prompt = `You are reading a receipt/invoice (photo or PDF) for a boat expense-tracking app. Extract the following fields and respond with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "description": string - the vendor/business name or a short description of the purchase,
  "amount": number | null - the total amount paid, digits only (no currency symbol),
  "expense_date": string | null - the date on the receipt in YYYY-MM-DD format,
  "invoice_number": string | null - invoice/receipt number if visible,
  "category": string | null - your best guess, must be exactly one of: ${EXPENSE_CATEGORIES.join(", ")}
}
If a field isn't visible or you're not confident, use null for it. Respond in Hebrew for the description field if the receipt is in Hebrew, otherwise keep the original language.`;

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
        max_tokens: 512,
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
    return NextResponse.json({ error: "שירות הסריקה החזיר שגיאה" }, { status: 502 });
  }

  const data = await response.json();
  const text: string | undefined = data?.content?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית." }, { status: 200 });
  }

  try {
    const jsonText = text.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({ result: parsed });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית." }, { status: 200 });
  }
}
