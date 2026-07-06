import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/locale";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { docId } = await params;
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const supabase = await createClient();
  const { t } = await getTranslator();

  // RLS on `documents` scopes this to boats the caller may access.
  const { data: doc } = await supabase
    .from("documents")
    .select("name, file_path")
    .eq("id", docId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: t("doc_not_found") }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_path, 60, forceDownload ? { download: doc.name || true } : undefined);

  if (error || !signed) {
    return NextResponse.json({ error: t("doc_download_error") }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
