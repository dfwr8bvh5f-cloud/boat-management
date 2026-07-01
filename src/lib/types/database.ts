export type UserRole = "management" | "captain" | "owner";
export type BoatStatus = "active" | "maintenance" | "inactive";
export type MaintenanceStatus = "planned" | "in_progress" | "completed";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type DocumentType = "insurance" | "license" | "registration" | "other";
export type ApprovalStatus = "pending" | "approved";
export type ExpenseCategory =
  | "diesel"
  | "docking_out"
  | "base_docking"
  | "electricity_water"
  | "capital_expenses"
  | "formalities"
  | "laundry_cleaning"
  | "provisions"
  | "repairs"
  | "services"
  | "crew"
  | "management"
  | "lpg"
  | "wifi_phone"
  | "underway_expenses"
  | "owner_trip"
  | "company"
  | "crew_food"
  | "boat_show"
  | "other";
export type PaymentMethod = "bank_transfer" | "card" | "cash" | "other";
export type PaidByType = "crew" | "management";

// NOTE: these must stay `type` aliases (not `interface`). Supabase's query
// builder does deep conditional-type inference on the Database type below,
// and interfaces break that inference (every query result collapses to
// `never`) in a way plain object type literals don't.
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  boat_id: string | null;
  phone: string | null;
  created_at: string;
};

export type Boat = {
  id: string;
  name: string;
  model: string | null;
  registration_number: string | null;
  year_built: number | null;
  length_meters: number | null;
  home_port: string | null;
  status: BoatStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceRecord = {
  id: string;
  boat_id: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduled_date: string | null;
  completed_date: string | null;
  cost: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Booking = {
  id: string;
  boat_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  start_date: string;
  end_date: string;
  status: BookingStatus;
  price: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  boat_id: string;
  description: string;
  invoice_number: string | null;
  amount: number;
  category: ExpenseCategory;
  payment_method: PaymentMethod;
  paid_by: PaidByType;
  expense_date: string;
  receipt_path: string | null;
  status: ApprovalStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetCategory = {
  boat_id: string;
  category: ExpenseCategory;
  amount: number;
  updated_at: string;
};

export type BudgetSubcategory = {
  id: string;
  boat_id: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
  created_at: string;
};

export type BoatDocument = {
  id: string;
  boat_id: string;
  name: string;
  doc_type: DocumentType;
  file_path: string;
  expiry_date: string | null;
  uploaded_by: string | null;
  created_at: string;
};

type NoRelationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> } & NoRelationships;
      boats: { Row: Boat; Insert: Partial<Boat>; Update: Partial<Boat> } & NoRelationships;
      maintenance_records: {
        Row: MaintenanceRecord;
        Insert: Partial<MaintenanceRecord>;
        Update: Partial<MaintenanceRecord>;
      } & NoRelationships;
      bookings: { Row: Booking; Insert: Partial<Booking>; Update: Partial<Booking> } & NoRelationships;
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> } & NoRelationships;
      budget_categories: {
        Row: BudgetCategory;
        Insert: Partial<BudgetCategory>;
        Update: Partial<BudgetCategory>;
      } & NoRelationships;
      budget_subcategories: {
        Row: BudgetSubcategory;
        Insert: Partial<BudgetSubcategory>;
        Update: Partial<BudgetSubcategory>;
      } & NoRelationships;
      documents: {
        Row: BoatDocument;
        Insert: Partial<BoatDocument>;
        Update: Partial<BoatDocument>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      boat_status: BoatStatus;
      maintenance_status: MaintenanceStatus;
      booking_status: BookingStatus;
      document_type: DocumentType;
      approval_status: ApprovalStatus;
      expense_category: ExpenseCategory;
      payment_method: PaymentMethod;
      paid_by_type: PaidByType;
    };
    CompositeTypes: Record<string, never>;
  };
};
