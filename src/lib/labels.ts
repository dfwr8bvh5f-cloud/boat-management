import type {
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

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  diesel: "דלק",
  docking_out: "עגינה בחוץ",
  base_docking: "עגינת בסיס",
  electricity_water: "חשמל ומים",
  capital_expenses: "הוצאות הוניות",
  formalities: "נהלים ורישיונות",
  laundry_cleaning: "כביסה/ניקיון",
  provisions: "אספקה/מזון",
  repairs: "תיקונים",
  services: "שירותים",
  crew: "צוות",
  management: "ניהול",
  lpg: "גז",
  wifi_phone: "וויפיי/טלפון",
  underway_expenses: "הוצאות הפלגה",
  owner_trip: "טיול בעלים",
  company: "חברה",
  crew_food: "אוכל לצוות",
  boat_show: "תערוכת סירות",
  other: "אחר",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "card", "cash", "other"];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "העברה בנקאית",
  card: "כרטיס אשראי",
  cash: "מזומן",
  other: "אחר",
};

export const PAID_BY_LABELS: Record<PaidByType, string> = {
  crew: "צוות",
  management: "חברת ניהול",
};

export const CLASSIFICATIONS: IssueClassification[] = ["capital", "maintenance", "repair", "service", "warranty"];

export const CLASSIFICATION_LABELS: Record<IssueClassification, string> = {
  capital: "הוני",
  maintenance: "תחזוקה",
  repair: "תיקון",
  service: "שירות",
  warranty: "אחריות",
};

export const AREAS: IssueArea[] = ["interior", "exterior", "technical", "equipment"];

export const AREA_LABELS: Record<IssueArea, string> = {
  interior: "פנים הסירה",
  exterior: "חוץ הסירה",
  technical: "טכני",
  equipment: "ציוד",
};

export const OP_STATUS_LABELS: Record<IssueOpStatus, string> = {
  not_started: "לא התחיל",
  pending: "ממתין",
  in_progress: "בטיפול",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const OP_STATUS_COLORS: Record<IssueOpStatus, string> = {
  not_started: "text-fleet-coral border-fleet-coral",
  pending: "text-fleet-brass border-fleet-brass",
  in_progress: "text-fleet-navy2 border-fleet-navy2",
  completed: "text-fleet-moss border-fleet-moss",
  cancelled: "text-fleet-ink border-fleet-ink",
};

export const USAGE_TYPES: UsageType[] = ["owner", "charter", "exhibition"];

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  owner: "שימוש בעלים",
  charter: "צארטר",
  exhibition: "תערוכה",
};

export const USAGE_TYPE_COLORS: Record<UsageType, string> = {
  owner: "#D9A466",
  charter: "#C98787",
  exhibition: "#D4BC70",
};

export const CALENDAR_FREE_COLOR = "#8FB89C";

export const SHOPPING_UNITS: ShoppingUnit[] = ["pcs", "kg", "g", "l", "ml", "pack"];

export const SHOPPING_UNIT_LABELS: Record<ShoppingUnit, string> = {
  pcs: "יח'",
  kg: "ק\"ג",
  g: "גרם",
  l: "ליטר",
  ml: "מ\"ל",
  pack: "חבילה",
};

export const TRANSFER_VEHICLE_LABELS: Record<TransferVehicle, string> = {
  van: "ואן",
  taxi: "מונית רגילה",
};
