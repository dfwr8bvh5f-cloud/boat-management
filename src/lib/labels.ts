import type { ExpenseCategory, PaidByType, PaymentMethod } from "@/lib/types/database";

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
