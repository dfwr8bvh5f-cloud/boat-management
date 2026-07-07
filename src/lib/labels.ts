import type {
  BoatType,
  CashTxType,
  ExpenseCategory,
  IssueArea,
  IssueClassification,
  IssueOpStatus,
  PaidByType,
  PaymentMethod,
  ShoppingUnit,
  TechnicalSpecCategory,
  TransferVehicle,
  UsageType,
} from "@/lib/types/database";
import type { Locale } from "@/lib/i18n/dictionaries";
import { translate } from "@/lib/i18n/translate";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "diesel",
  "docking_out",
  "base_docking",
  "electricity_water",
  "capital_expenses",
  "formalities",
  "laundry_cleaning",
  "provisions",
  "repairs",
  "services",
  "crew",
  "management",
  "lpg",
  "wifi_phone",
  "underway_expenses",
  "owner_trip",
  "company",
  "crew_food",
  "boat_show",
  "project_boat_cost",
  "project",
  "bank_fees",
  "other",
];

// Boat shows are a commercial/charter-marketing expense, not something a
// privately owned boat incurs - hide the category for private boats.
// The two "project" categories only make sense for Lulu, so they're hidden
// everywhere else.
export function getExpenseCategories(boatType?: BoatType, boatName?: string): ExpenseCategory[] {
  return EXPENSE_CATEGORIES.filter((c) => {
    if (c === "boat_show" && boatType === "private") return false;
    if ((c === "project_boat_cost" || c === "project") && boatName !== "לולו") return false;
    return true;
  });
}

// Stable per-category colors for charts (pie/donut, bar comparisons) so a
// given category always renders the same color regardless of sort order.
// A pastel palette in a single fixed hue order (never cycled) - generated in
// OKLCH (even hue spacing, alternating lightness/chroma for adjacent
// contrast) and validated for lightness band, chroma floor, and CVD
// separation so no two categories read as the same shade.
export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  diesel: "#D86E67",
  docking_out: "#EC9475",
  base_docking: "#CF7A34",
  electricity_water: "#DBA156",
  capital_expenses: "#B58C00",
  formalities: "#BBB155",
  laundry_cleaning: "#8A9D2F",
  provisions: "#8FBE72",
  repairs: "#4BA965",
  services: "#5CC59D",
  crew: "#00AC98",
  management: "#38C4C7",
  lpg: "#00A6C3",
  wifi_phone: "#52BCE7",
  underway_expenses: "#3B99DE",
  owner_trip: "#82AFF7",
  company: "#7B89E4",
  crew_food: "#AEA1F1",
  boat_show: "#A87AD2",
  project_boat_cost: "#D195D9",
  project: "#C66FAF",
  bank_fees: "#E78FB3",
  other: "#D66C80",
};

export function getCategoryColors(): Record<ExpenseCategory, string> {
  return EXPENSE_CATEGORY_COLORS;
}

// Green under 30% used, yellow up to 70%, red beyond - shared by budget cards
// and the period report's annual budget-vs-actual table.
export function budgetColor(pctUsed: number) {
  if (pctUsed <= 30) return "#8FD9A8";
  if (pctUsed <= 70) return "#F5D77C";
  return "#F0938A";
}

export function getCategoryLabels(locale: Locale): Record<ExpenseCategory, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    diesel: t("cat_diesel"),
    docking_out: t("cat_docking_out"),
    base_docking: t("cat_base_docking"),
    electricity_water: t("cat_electricity_water"),
    capital_expenses: t("cat_capital_expenses"),
    formalities: t("cat_formalities"),
    laundry_cleaning: t("cat_laundry_cleaning"),
    provisions: t("cat_provisions"),
    repairs: t("cat_repairs"),
    services: t("cat_services"),
    crew: t("cat_crew"),
    management: t("cat_management"),
    lpg: t("cat_lpg"),
    wifi_phone: t("cat_wifi_phone"),
    underway_expenses: t("cat_underway_expenses"),
    owner_trip: t("cat_owner_trip"),
    company: t("cat_company"),
    crew_food: t("cat_crew_food"),
    boat_show: t("cat_boat_show"),
    project_boat_cost: t("cat_project_boat_cost"),
    project: t("cat_project"),
    bank_fees: t("cat_bank_fees"),
    other: t("cat_other"),
  };
}

export const PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "card", "cash", "other"];

export function getPaymentLabels(locale: Locale): Record<PaymentMethod, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    bank_transfer: t("pay_bank_transfer"),
    card: t("pay_card"),
    cash: t("pay_cash"),
    other: t("pay_other"),
  };
}

export function getPaidByLabels(locale: Locale): Record<PaidByType, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    crew: t("paid_by_crew"),
    management: t("paid_by_management"),
  };
}

export function getCashTxLabels(locale: Locale): Record<CashTxType, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    withdrawal: t("withdrawal"),
    received: t("cash_received_label"),
    usage: t("cash_usage"),
  };
}

// Withdrawals and cash received in hand both add to the cash box; only
// usage takes money out.
export function isCashInflow(type: CashTxType) {
  return type !== "usage";
}

export const CLASSIFICATIONS: IssueClassification[] = ["capital", "maintenance", "repair", "service", "warranty"];

export function getClassificationLabels(locale: Locale): Record<IssueClassification, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    capital: t("classif_capital"),
    maintenance: t("classif_maintenance"),
    repair: t("classif_repair"),
    service: t("classif_service"),
    warranty: t("classif_warranty"),
  };
}

export const TECHNICAL_SPEC_CATEGORIES: TechnicalSpecCategory[] = ["engine", "watermaker", "air_conditioner", "other"];

export function getTechnicalSpecCategoryLabels(locale: Locale): Record<TechnicalSpecCategory, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    engine: t("spec_cat_engine"),
    watermaker: t("spec_cat_watermaker"),
    air_conditioner: t("spec_cat_air_conditioner"),
    other: t("spec_cat_other"),
  };
}

export const AREAS: IssueArea[] = ["interior", "exterior", "technical", "equipment"];

export function getAreaLabels(locale: Locale): Record<IssueArea, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    interior: t("area_interior"),
    exterior: t("area_exterior"),
    technical: t("area_technical"),
    equipment: t("area_equipment"),
  };
}

export function getOpStatusLabels(locale: Locale): Record<IssueOpStatus, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    not_started: t("status_not_started"),
    pending: t("status_pending"),
    in_progress: t("status_in_progress"),
    completed: t("status_completed"),
    cancelled: t("status_cancelled"),
  };
}

export const OP_STATUS_COLORS: Record<IssueOpStatus, string> = {
  not_started: "text-fleet-coral border-fleet-coral",
  pending: "text-fleet-brass border-fleet-brass",
  in_progress: "text-fleet-navy2 border-fleet-navy2",
  completed: "text-fleet-moss border-fleet-moss",
  cancelled: "text-fleet-ink border-fleet-ink",
};

export const USAGE_TYPES: UsageType[] = ["owner", "charter", "exhibition", "other"];

export function getUsageTypeLabels(locale: Locale): Record<UsageType, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    owner: t("usage_owner"),
    charter: t("usage_charter"),
    exhibition: t("usage_exhibition"),
    other: t("usage_other"),
  };
}

// Same pastel family and validation as EXPENSE_CATEGORY_COLORS above.
export const USAGE_TYPE_COLORS: Record<UsageType, string> = {
  owner: "#DF935E",
  charter: "#D66773",
  exhibition: "#B9B750",
  other: "#7797DD",
};

export const CALENDAR_FREE_COLOR = "#78BB7A";
export const CALENDAR_EVENT_COLOR = "#0094A2";

export const SHOPPING_UNITS: ShoppingUnit[] = ["pcs", "kg", "g", "l", "ml", "pack"];

export function getShoppingUnitLabels(locale: Locale): Record<ShoppingUnit, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    pcs: t("unit_pcs"),
    kg: t("unit_kg"),
    g: t("unit_g"),
    l: t("unit_l"),
    ml: t("unit_ml"),
    pack: t("unit_pack"),
  };
}

export function getTransferVehicleLabels(locale: Locale): Record<TransferVehicle, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    van: t("transfer_van"),
    taxi: t("transfer_taxi"),
  };
}
