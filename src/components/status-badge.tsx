import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const KEY_MAP: Record<string, Parameters<typeof translate>[1]> = {
  active: "badge_active",
  maintenance: "badge_maintenance",
  inactive: "badge_inactive",
  planned: "badge_planned",
  in_progress: "badge_in_progress",
  completed: "badge_completed",
  pending: "pending",
  approved: "approved",
  confirmed: "badge_confirmed",
  cancelled: "badge_cancelled",
  income: "badge_income",
  expense: "badge_expense",
  insurance: "badge_insurance",
  license: "badge_license",
  registration: "badge_registration",
  safety: "badge_safety",
  myba_contract: "badge_myba_contract",
  company_docs: "badge_company_docs",
  bank: "badge_bank",
  charter_license: "badge_charter_license",
  other: "badge_other",
};

const COLORS: Record<string, string> = {
  active: "text-fleet-moss bg-fleet-moss/15",
  maintenance: "text-fleet-brass bg-fleet-brass/15",
  inactive: "text-fleet-ink bg-fleet-ink/10",
  planned: "text-fleet-brass bg-fleet-brass/15",
  in_progress: "text-fleet-brass bg-fleet-brass/15",
  completed: "text-fleet-moss bg-fleet-moss/15",
  pending: "text-fleet-brass bg-fleet-brass/15",
  approved: "text-fleet-moss bg-fleet-moss/15",
  confirmed: "text-fleet-moss bg-fleet-moss/15",
  cancelled: "text-fleet-coral bg-fleet-coral/15",
  income: "text-fleet-moss bg-fleet-moss/15",
  expense: "text-fleet-coral bg-fleet-coral/15",
  insurance: "text-fleet-brass bg-fleet-brass/15",
  license: "text-fleet-brass bg-fleet-brass/15",
  registration: "text-fleet-ink bg-fleet-ink/10",
  company_docs: "text-fleet-ink bg-fleet-ink/10",
  bank: "text-fleet-brass bg-fleet-brass/15",
  charter_license: "text-fleet-brass bg-fleet-brass/15",
  other: "text-fleet-ink bg-fleet-ink/10",
};

export function StatusBadge({ value, locale = "he" }: { value: string; locale?: Locale }) {
  const key = KEY_MAP[value];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        COLORS[value] ?? "text-fleet-ink bg-fleet-ink/10"
      }`}
    >
      {key ? translate(locale, key) : value}
    </span>
  );
}
