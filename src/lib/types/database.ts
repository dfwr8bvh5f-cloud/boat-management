export type UserRole = "management" | "captain" | "owner";
export type BoatStatus = "active" | "maintenance" | "inactive";
export type DocumentType = "insurance" | "license" | "registration" | "safety" | "other";
export type UsageType = "owner" | "charter" | "exhibition";
export type ApprovalStatus = "pending" | "approved";
export type IssueClassification = "capital" | "maintenance" | "repair" | "service" | "warranty";
export type IssueArea = "interior" | "exterior" | "technical" | "equipment";
export type IssueOpStatus = "not_started" | "pending" | "in_progress" | "completed" | "cancelled";
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
export type IncomeType = "actual" | "future";
export type CashTxType = "withdrawal" | "usage";
export type BoatType = "commercial" | "private" | "for_sale";
export type ShoppingUnit = "pcs" | "kg" | "g" | "l" | "ml" | "pack";
export type TransferVehicle = "van" | "taxi";

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
  boat_type: BoatType;
  sale_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogPhoto = {
  id: string;
  boat_id: string;
  photo_path: string;
  created_by: string | null;
  created_at: string;
};

export type ShoppingList = {
  id: string;
  boat_id: string;
  title: string;
  booking_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShoppingListItem = {
  id: string;
  list_id: string;
  boat_id: string;
  name: string;
  quantity: number;
  unit: ShoppingUnit;
  photo_path: string | null;
  checked: boolean;
  created_at: string;
};

export type TransferRequest = {
  id: string;
  boat_id: string;
  people_count: number;
  flight_number: string | null;
  transfer_date: string;
  landing_time: string | null;
  vehicle: TransferVehicle;
  pickup: string;
  dropoff: string;
  notes: string | null;
  arranged: boolean;
  created_by: string | null;
  created_at: string;
};

export type Issue = {
  id: string;
  boat_id: string;
  title: string;
  classification: IssueClassification;
  area: IssueArea;
  location: string | null;
  supplier: string | null;
  estimated_cost: number | null;
  payment_method: PaymentMethod | null;
  due_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  photo_path: string | null;
  quote_path: string | null;
  op_status: IssueOpStatus;
  status: ApprovalStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
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
  status: ApprovalStatus;
  usage_type: UsageType;
  guests_count: number | null;
  sailing_area: string | null;
  price: number | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingGuest = {
  id: string;
  booking_id: string;
  boat_id: string;
  name: string;
  passport_number: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  photo_path: string | null;
  created_at: string;
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
  last_checked_date: string | null;
  uploaded_by: string | null;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type Staff = {
  id: string;
  boat_id: string;
  name: string;
  position: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  start_date: string;
  salary: number | null;
  payment_method: PaymentMethod | null;
  resume_path: string | null;
  photo_path: string | null;
  status: ApprovalStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

// Read-only, salary-masking view over `staff` - see migration 0005 for why
// this exists. Always read staff data through this, never the base table.
// Same shape as Staff; salary is simply null when the caller may not see it.
export type StaffVisible = Staff;

export type Income = {
  id: string;
  boat_id: string;
  source: string;
  amount: number;
  income_date: string;
  type: IncomeType;
  status: ApprovalStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CashTransaction = {
  id: string;
  boat_id: string;
  type: CashTxType;
  amount: number;
  tx_date: string;
  notes: string | null;
  status: ApprovalStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringExpense = {
  id: string;
  boat_id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  payment_method: PaymentMethod;
  day_of_month: number;
  last_paid_month: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BankBalance = {
  boat_id: string;
  balance: number;
  updated_at: string;
};

type NoRelationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> } & NoRelationships;
      boats: { Row: Boat; Insert: Partial<Boat>; Update: Partial<Boat> } & NoRelationships;
      issues: { Row: Issue; Insert: Partial<Issue>; Update: Partial<Issue> } & NoRelationships;
      bookings: { Row: Booking; Insert: Partial<Booking>; Update: Partial<Booking> } & NoRelationships;
      booking_guests: {
        Row: BookingGuest;
        Insert: Partial<BookingGuest>;
        Update: Partial<BookingGuest>;
      } & NoRelationships;
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
      staff: { Row: Staff; Insert: Partial<Staff>; Update: Partial<Staff> } & NoRelationships;
      incomes: { Row: Income; Insert: Partial<Income>; Update: Partial<Income> } & NoRelationships;
      cash_transactions: {
        Row: CashTransaction;
        Insert: Partial<CashTransaction>;
        Update: Partial<CashTransaction>;
      } & NoRelationships;
      recurring_expenses: {
        Row: RecurringExpense;
        Insert: Partial<RecurringExpense>;
        Update: Partial<RecurringExpense>;
      } & NoRelationships;
      bank_balances: { Row: BankBalance; Insert: Partial<BankBalance>; Update: Partial<BankBalance> } & NoRelationships;
      catalog_photos: {
        Row: CatalogPhoto;
        Insert: Partial<CatalogPhoto>;
        Update: Partial<CatalogPhoto>;
      } & NoRelationships;
      shopping_lists: {
        Row: ShoppingList;
        Insert: Partial<ShoppingList>;
        Update: Partial<ShoppingList>;
      } & NoRelationships;
      shopping_list_items: {
        Row: ShoppingListItem;
        Insert: Partial<ShoppingListItem>;
        Update: Partial<ShoppingListItem>;
      } & NoRelationships;
      transfer_requests: {
        Row: TransferRequest;
        Insert: Partial<TransferRequest>;
        Update: Partial<TransferRequest>;
      } & NoRelationships;
    };
    Views: {
      staff_visible: { Row: StaffVisible } & NoRelationships;
    };
    Functions: {
      apply_cash_withdrawal: {
        Args: { p_boat_id: string; p_amount: number };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      boat_status: BoatStatus;
      document_type: DocumentType;
      approval_status: ApprovalStatus;
      expense_category: ExpenseCategory;
      payment_method: PaymentMethod;
      paid_by_type: PaidByType;
      issue_classification: IssueClassification;
      issue_area: IssueArea;
      issue_op_status: IssueOpStatus;
      usage_type: UsageType;
      income_type: IncomeType;
      cash_tx_type: CashTxType;
      boat_type: BoatType;
      shopping_unit: ShoppingUnit;
      transfer_vehicle: TransferVehicle;
    };
    CompositeTypes: Record<string, never>;
  };
};
