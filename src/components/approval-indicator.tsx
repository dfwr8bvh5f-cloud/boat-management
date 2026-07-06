import { Check } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// A shrunk-down stand-in for StatusBadge specifically for "approved" -
// a small checkmark instead of a text pill, freeing up row space. Any
// other status (e.g. "pending") still falls back to the full badge.
export function ApprovalIndicator({ value, locale }: { value: string; locale: Locale }) {
  if (value === "approved") {
    return <Check size={16} className="shrink-0 text-fleet-moss" aria-label={translate(locale, "approved")} />;
  }
  return <StatusBadge value={value} locale={locale} />;
}
