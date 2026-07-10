import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  await requireProfile();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "סריקת דרכונים לא מוגדרת (חסר מפתח API בשרת)" }, { status: 501 });
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

  const prompt = `You are reading a photo of a passport or ID document for a boat charter's passenger manifest. Extract the following fields and respond with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "full_name": string | null - the holder's full name as printed on the document,
  "date_of_birth": string | null - date of birth in YYYY-MM-DD format,
  "nationality": string | null - the holder's nationality/country,
  "passport_number": string | null - the passport or ID document number
}
If a field isn't visible or you're not confident, use null for it.`;

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
            content: [{ type: "image", source: { type: "base64", media_type: file.type, data: base64 } }, { type: "text", text: prompt }],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו להתחבר לשירות הסריקה" }, { status: 502 });
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`scan-passport: Anthropic API returned ${response.status}:`, body);
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
