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
  other: "badge_other",
};

const COLORS: Record<string, string> = {
  active: "text-fleet-moss border-fleet-moss",
  maintenance: "text-fleet-brass border-fleet-brass",
  inactive: "text-fleet-ink border-fleet-ink",
  planned: "text-fleet-brass border-fleet-brass",
  in_progress: "text-fleet-brass border-fleet-brass",
  completed: "text-fleet-moss border-fleet-moss",
  pending: "text-fleet-brass border-fleet-brass",
  approved: "text-fleet-moss border-fleet-moss",
  confirmed: "text-fleet-moss border-fleet-moss",
  cancelled: "text-fleet-coral border-fleet-coral",
  income: "text-fleet-moss border-fleet-moss",
  expense: "text-fleet-coral border-fleet-coral",
  insurance: "text-fleet-brass border-fleet-brass",
  license: "text-fleet-brass border-fleet-brass",
  registration: "text-fleet-ink border-fleet-ink",
  other: "text-fleet-ink border-fleet-ink",
};

export function StatusBadge({ value, locale = "he" }: { value: string; locale?: Locale }) {
  const key = KEY_MAP[value];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[11px] font-bold ${
        COLORS[value] ?? "text-fleet-ink border-fleet-ink"
      }`}
    >
      {key ? translate(locale, key) : value}
    </span>
  );
}
