// wa.me needs a full international number with no leading zeros/spaces -
// these are Greek phone numbers, almost always written as a bare local
// number, so a 10-digit (or shorter, already-missing-country-code) number
// gets Greece's country code (30) prepended. A "00"-prefixed number
// (already international) just has the "00" stripped. Only the first
// number is used when a cell has two separated by " - ".
export function whatsAppNumber(phone: string) {
  let digits = phone.split("-")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!digits.startsWith("30")) digits = `30${digits}`;
  return digits;
}

// Greek numbering plan: mobiles start with 6, landlines with 2 - a landline
// can't have WhatsApp, so its icon should be skipped and only the call link shown.
export function isLikelyGreekLandline(phone: string): boolean {
  let digits = phone.split("-")[0].replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("30") && digits.length > 10) digits = digits.slice(2);
  return digits.startsWith("2");
}
