// A document's display `name` is free text the user typed (e.g. "Insurance
// Policy") and usually has no file extension, while `file_path` keeps the
// extension of the file that was actually uploaded. Sharing/downloading
// under a name with no extension makes some apps (WhatsApp, Mail, etc.)
// fail to recognize the file type, so the extension is carried over here.
export function documentFileName(name: string | null, filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot) : "";
  const base = (name || "document").trim() || "document";
  return ext && base.toLowerCase().endsWith(ext.toLowerCase()) ? base : `${base}${ext}`;
}
