import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/labels";
import { extractPdfBytes } from "@/lib/pdf-sanitize";

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

  // Optional, only sent from the fleet-wide quick-add form (where the boat
  // isn't already fixed by the page). A closed list, not free text - the AI
  // is only ever allowed to echo back one of these exact names, never invent
  // or guess-match a close one, since picking the wrong boat here means the
  // expense silently posts to the wrong boat's books.
  let boatNames: string[] = [];
  const boatNamesRaw = formData.get("boat_names");
  if (typeof boatNamesRaw === "string") {
    try {
      const parsed = JSON.parse(boatNamesRaw);
      if (Array.isArray(parsed)) boatNames = parsed.filter((n): n is string => typeof n === "string" && n.trim() !== "");
    } catch {
      // Malformed input from the client - ignore and proceed without boat matching.
    }
  }

  const rawBytes = Buffer.from(await file.arrayBuffer());
  // Some e-invoicing portals export a "PDF" that's actually an HTML page
  // with the real PDF bytes glued inside - opens fine in any desktop
  // viewer (they scan ahead for %PDF-), but a strict parser like
  // Anthropic's rejects it outright. Strip the wrapper if present.
  const bytes = file.type === "application/pdf" ? extractPdfBytes(rawBytes) : rawBytes;
  const base64 = bytes.toString("base64");
  const contentBlock =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };

  const boatNameField =
    boatNames.length > 0
      ? `,\n  "boat_name": string | null - ONLY if the document clearly names a vessel/yacht that exactly matches one of these known boat names, return that exact name copied verbatim from the list: [${boatNames.join(", ")}]. If none is clearly and exactly named, or you're unsure, return null - never guess or return a close/partial match.`
      : "";

  const prompt = `You are reading a receipt/invoice (photo or PDF) for a boat expense-tracking app. Extract the following fields and respond with ONLY a raw JSON object (no markdown fences, no commentary):
{
  "description": string - the vendor/business name or a short description of the purchase,
  "amount": number | null - the total amount paid, digits only (no currency symbol),
  "expense_date": string | null - the date on the receipt in YYYY-MM-DD format,
  "invoice_number": string | null - invoice/receipt number if visible,
  "category": string | null - your best guess, must be exactly one of: ${EXPENSE_CATEGORIES.join(", ")}${boatNameField}
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
  } catch (e) {
    console.error("scan-receipt: fetch to Anthropic failed:", e);
    return NextResponse.json({ error: `לא הצלחנו להתחבר לשירות הסריקה: ${String(e)}` }, { status: 502 });
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`scan-receipt: Anthropic API returned ${response.status}:`, body);
    // A PDF that isn't a clean, unencrypted, standard file (password-
    // protected, corrupted, or an unusual export) gets rejected by the
    // scanning service itself - no amount of retrying fixes that, so this
    // is surfaced as actionable guidance instead of a dead end.
    if (body.includes("PDF specified was not valid")) {
      return NextResponse.json(
        { error: "לא הצלחנו לקרוא את קובץ ה-PDF הזה (ייתכן שהוא מוצפן או פגום). אפשר לצלם את המסמך במצלמה במקום, או למלא את הפרטים ידנית." },
        { status: 200 }
      );
    }
    // Surfaced directly in the UI (not just server logs) - there's no way
    // to view Vercel's server logs from this session, so this is the only
    // channel to actually see why a scan failed. Fine to leave in - it's
    // a management-only action, never end-user facing.
    return NextResponse.json({ error: `שירות הסריקה החזיר שגיאה ${response.status}: ${body.slice(0, 300)}` }, { status: 502 });
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
