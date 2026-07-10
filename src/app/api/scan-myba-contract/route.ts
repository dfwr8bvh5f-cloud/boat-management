import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת חוזים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (!SUPPORTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "פורמט קובץ לא נתמך (תמונה או PDF בלבד)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  const contentBlock =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

  const prompt = `You are reading a signed MYBA yacht charter contract for a boat management app. Extract the following fields and respond with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "customer_name": string | null - the charterer/guest name or company on the contract,
  "start_date": string | null - charter start date in YYYY-MM-DD format,
  "end_date": string | null - charter end date in YYYY-MM-DD format,
  "sailing_area": string | null - the cruising/sailing area mentioned,
  "departure_port": string | null - the place of delivery / embarkation port,
  "arrival_port": string | null - the place of re-delivery / disembarkation port,
  "fee_amount": number | null - the total charter fee, digits only (no currency symbol),
  "deposit_amount": number | null - the advance payment / deposit (APA or security deposit) amount, digits only,
  "payment_date": string | null - the date the deposit/first payment is due, in YYYY-MM-DD format,
  "booking_reference": string | null - the contract/booking/reservation reference number if visible
}
If a field isn't visible or you're not confident, use null for it. Respond in Hebrew for customer_name/sailing_area if the contract is in Hebrew, otherwise keep the original language.`;

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
    const body = await response.text();
    console.error(`scan-myba-contract: Anthropic API returned ${response.status}:`, body);
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
