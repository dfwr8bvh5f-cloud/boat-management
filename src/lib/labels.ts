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
  "other",
];

// Boat shows are a commercial/charter-marketing expense, not something a
// privately owned boat incurs - hide the category for private boats.
export function getExpenseCategories(boatType?: BoatType): ExpenseCategory[] {
  return boatType === "private" ? EXPENSE_CATEGORIES.filter((c) => c !== "boat_show") : EXPENSE_CATEGORIES;
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

export const USAGE_TYPES: UsageType[] = ["owner", "charter", "exhibition"];

export function getUsageTypeLabels(locale: Locale): Record<UsageType, string> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  return {
    owner: t("usage_owner"),
    charter: t("usage_charter"),
    exhibition: t("usage_exhibition"),
  };
}

export const USAGE_TYPE_COLORS: Record<UsageType, string> = {
  owner: "#D9A466",
  charter: "#C98787",
  exhibition: "#D4BC70",
};

export const CALENDAR_FREE_COLOR = "#8FB89C";

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
