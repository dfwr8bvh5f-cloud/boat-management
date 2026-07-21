import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";

// Parses raw pasted charter-confirmation text (e.g. copied from an email)
// into the future-income form's fields - AI only ever extracts what's
// literally written; it never computes the net price to owner, which is
// always the deterministic computeCharterBreakdown() output.
export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "פענוח טקסט לא מוגדר (חסר מפתח API בשרת)" }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "לא הוזן טקסט" }, { status: 400 });
  }

  const prompt = `You are reading a pasted yacht charter confirmation/booking text (often copied from an email) for a boat management app. Extract the following fields and respond with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "charter_code": string | null - the charter/booking code or reference number,
  "start_date": string | null - the charter start date in YYYY-MM-DD format,
  "end_date": string | null - the charter end date in YYYY-MM-DD format,
  "embarkation_port": string | null - the embarkation/delivery/base port (e.g. from a line like "Base: Athens to Kea", embarkation is the first place),
  "disembarkation_port": string | null - the disembarkation/re-delivery port (the second place in a "Base: X to Y" line),
  "gross_price": number | null - the gross/total charter fee, digits only, no currency symbol or VAT/APA wording
}
Dates in the source may be written as DD/MM/YYYY, sometimes with a time in parentheses (e.g. "06/07/2026 (12.00)") - convert to plain YYYY-MM-DD and discard the time. If a field isn't present or you're not confident, use null for it.`;

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
        messages: [{ role: "user", content: [{ type: "text", text: `${prompt}\n\nText:\n${text}` }] }],
      }),
    });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו להתחבר לשירות הפענוח" }, { status: 502 });
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`parse-charter-text: Anthropic API returned ${response.status}:`, errBody);
    return NextResponse.json({ error: "שירות הפענוח החזיר שגיאה" }, { status: 502 });
  }

  const data = await response.json();
  const resultText: string | undefined = data?.content?.[0]?.text;
  if (!resultText) {
    return NextResponse.json({ error: "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית." }, { status: 200 });
  }

  try {
    const jsonText = resultText.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({ result: parsed });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לזהות אוטומטית. ניתן למלא ידנית." }, { status: 200 });
  }
}
