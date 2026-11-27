import type { translate } from "@/lib/i18n/translate";

type LabelKey = Parameters<typeof translate>[1];

// Categories offered when uploading/editing/filtering documents, in display
// order. Stored values are unchanged DB enum values where one already
// existed (company_docs, bank, ...) - only their labels were reworded.
export const DOC_CATEGORIES: { value: string; labelKey: LabelKey }[] = [
  { value: "vessel", labelKey: "doc_vessel" },
  { value: "insurance", labelKey: "doc_insurance" },
  { value: "company_docs", labelKey: "doc_company_docs" },
  { value: "crew", labelKey: "doc_crew" },
  { value: "bank", labelKey: "doc_bank" },
  { value: "contract", labelKey: "doc_contract" },
  { value: "safety", labelKey: "doc_safety" },
  { value: "other", labelKey: "doc_other" },
];

// Values no longer offered for new documents but still possible on existing
// rows (the MYBA contract is auto-created by the bookings/income flows).
const LEGACY_LABEL_KEYS: Record<string, LabelKey> = {
  myba_contract: "doc_myba_contract",
  charter_license: "doc_charter_license",
  license: "doc_license",
  registration: "doc_registration",
};

export const DOC_TYPE_LABEL_KEYS: Record<string, LabelKey> = {
  ...LEGACY_LABEL_KEYS,
  ...Object.fromEntries(DOC_CATEGORIES.map((c) => [c.value, c.labelKey])),
};

// Sort position for the documents page; anything unknown sorts last.
export const DOC_TYPE_ORDER: Record<string, number> = Object.fromEntries(
  [...DOC_CATEGORIES.map((c) => c.value), ...Object.keys(LEGACY_LABEL_KEYS)].map((v, i) => [v, i])
);
