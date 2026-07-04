export type UserRole = "management" | "captain" | "owner";
export type BoatStatus = "active" | "maintenance" | "inactive";
export type DocumentType = "insurance" | "license" | "registration" | "safety" | "myba_contract" | "other";
export type UsageType = "owner" | "charter" | "exhibition" | "other";
export type ApprovalStatus = "pending" | "approved";
export type IssueClassification = "capital" | "maintenance" | "repair" | "service" | "warranty";
export type IssueArea = "interior" | "exterior" | "technical" | "equipment";
export type IssueOpStatus = "not_started" | "pending" | "in_progress" | "completed" | "cancelled";
export type TechnicalSpecCategory = "engine" | "watermaker" | "air_conditioner" | "other";
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
  | "project_boat_cost"
  | "project"
  | "other";
export type PaymentMethod = "bank_transfer" | "card" | "cash" | "other";
export type PaidByType = "crew" | "management";
export type IncomeType = "actual" | "future";
export type CashTxType = "withdrawal" | "usage" | "received";
export type BoatType = "commercial" | "private" | "for_sale";
export type ShoppingUnit = "pcs" | "kg" | "g" | "l" | "ml" | "pack";
export type TransferVehicle = "van" | "taxi";
export type ReportType = "financial" | "technical";

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
  beam_meters: number | null;
  draft_meters: number | null;
  flag: string | null;
  berth: string | null;
  mmsi: string | null;
  home_port: string | null;
  status: BoatStatus;
  boat_type: BoatType;
  sale_price: number | null;
  logo_path: string | null;
  logo_position_x: number;
  logo_position_y: number;
  logo_scale: number;
  image_path: string | null;
  parent_boat_id: string | null;
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

export type BoatGalleryPhoto = {
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

export type TechnicalSpec = {
  id: string;
  boat_id: string;
  category: TechnicalSpecCategory;
  name: string;
  quantity: number | null;
  details: string | null;
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
  usage_type_other: string | null;
  guests_count: number | null;
  sailing_area: string | null;
  departure_port: string | null;
  arrival_port: string | null;
  price: number | null;
  notes: string | null;
  booking_reference: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppSettings = {
  id: boolean;
  company_logo_path: string | null;
  company_logo_position_x: number;
  company_logo_position_y: number;
  updated_at: string;
};

export type BoatEvent = {
  id: string;
  boat_id: string;
  title: string;
  event_date: string;
  created_by: string | null;
  created_at: string;
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
  payment_method: PaymentMethod | null;
  paid_by: PaidByType;
  expense_date: string | null;
  receipt_path: string | null;
  notes: string | null;
  is_warranty: boolean;
  status: ApprovalStatus;
  bank_statement_line_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BankStmtLineType = "expense" | "cash_withdrawal" | "income";

export type BankStatementLine = {
  id: string;
  boat_id: string;
  tx_date: string;
  description: string;
  amount: number;
  statement_order: number;
  line_type: BankStmtLineType;
  created_by: string | null;
  created_at: string;
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
  rate: number | null;
  duration: number | null;
  duration_unit: string | null;
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
  booking_id: string | null;
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
  phone: string | null;
  start_date: string;
  salary: number | null;
  payment_method: PaymentMethod | null;
  resume_path: string | null;
  photo_path: string | null;
  status: ApprovalStatus;
  active: boolean;
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
  booking_id: string | null;
  bank_statement_line_id: string | null;
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
  bank_statement_line_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BankBalance = {
  boat_id: string;
  balance: number;
  updated_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type FinancialSnapshot = {
  totalExpenses: number;
  totalIncome: number;
  net: number;
  cashWithdrawals: number;
  cashUsage: number;
  byCategory: { category: ExpenseCategory; sum: number }[];
};

export type TechnicalSnapshot = {
  newIssues: number;
  resolvedThisMonth: number;
  stillOpen: number;
  issueList: { title: string; status: IssueOpStatus }[];
  docAlerts: { name: string; docType: DocumentType; expiryDate: string }[];
};

export type Report = {
  id: string;
  boat_id: string;
  type: ReportType;
  month: string | null;
  period_start: string | null;
  period_end: string | null;
  snapshot: FinancialSnapshot | TechnicalSnapshot;
  issued_by: string | null;
  issued_at: string;
};

type NoRelationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> } & NoRelationships;
      boats: { Row: Boat; Insert: Partial<Boat>; Update: Partial<Boat> } & NoRelationships;
      issues: { Row: Issue; Insert: Partial<Issue>; Update: Partial<Issue> } & NoRelationships;
      technical_specs: {
        Row: TechnicalSpec;
        Insert: Partial<TechnicalSpec>;
        Update: Partial<TechnicalSpec>;
      } & NoRelationships;
      bookings: { Row: Booking; Insert: Partial<Booking>; Update: Partial<Booking> } & NoRelationships;
      boat_events: { Row: BoatEvent; Insert: Partial<BoatEvent>; Update: Partial<BoatEvent> } & NoRelationships;
      app_settings: { Row: AppSettings; Insert: Partial<AppSettings>; Update: Partial<AppSettings> } & NoRelationships;
      booking_guests: {
        Row: BookingGuest;
        Insert: Partial<BookingGuest>;
        Update: Partial<BookingGuest>;
      } & NoRelationships;
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> } & NoRelationships;
      bank_statement_lines: {
        Row: BankStatementLine;
        Insert: Partial<BankStatementLine>;
        Update: Partial<BankStatementLine>;
      } & NoRelationships;
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
      bank_balances: { Row: BankBalance; Insert: Partial<BankBalance>; Update: Partial<BankBalance> } & NoRelationships;
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow>;
        Update: Partial<PushSubscriptionRow>;
      } & NoRelationships;
      catalog_photos: {
        Row: CatalogPhoto;
        Insert: Partial<CatalogPhoto>;
        Update: Partial<CatalogPhoto>;
      } & NoRelationships;
      boat_gallery_photos: {
        Row: BoatGalleryPhoto;
        Insert: Partial<BoatGalleryPhoto>;
        Update: Partial<BoatGalleryPhoto>;
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
      reports: { Row: Report; Insert: Partial<Report>; Update: Partial<Report> } & NoRelationships;
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
      technical_spec_category: TechnicalSpecCategory;
      usage_type: UsageType;
      income_type: IncomeType;
      cash_tx_type: CashTxType;
      boat_type: BoatType;
      shopping_unit: ShoppingUnit;
      transfer_vehicle: TransferVehicle;
      report_type: ReportType;
    };
    CompositeTypes: Record<string, never>;
  };
};
