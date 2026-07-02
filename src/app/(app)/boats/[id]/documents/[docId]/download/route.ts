import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { docId } = await params;
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const supabase = await createClient();

  // RLS on `documents` scopes this to boats the caller may access.
  const { data: doc } = await supabase
    .from("documents")
    .select("name, file_path")
    .eq("id", docId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "המסמך לא נמצא" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_path, 60, forceDownload ? { download: doc.name || true } : undefined);

  if (error || !signed) {
    return NextResponse.json({ error: "לא ניתן ליצור קישור להורדה" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
