export function isDocumentExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return days < 30;
}

// A document with no expiry date (e.g. company/bank documents) never
// expires, so it's always valid.
export function isDocumentExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}
