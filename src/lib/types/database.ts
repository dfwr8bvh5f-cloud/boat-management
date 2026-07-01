export type UserRole = "management" | "captain" | "owner";
export type BoatStatus = "active" | "maintenance" | "inactive";
export type MaintenanceStatus = "planned" | "in_progress" | "completed";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type FinancialType = "income" | "expense";
export type DocumentType = "insurance" | "license" | "registration" | "other";

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

export type FinancialRecord = {
  id: string;
  boat_id: string;
  type: FinancialType;
  category: string | null;
  amount: number;
  description: string | null;
  record_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
      financial_records: {
        Row: FinancialRecord;
        Insert: Partial<FinancialRecord>;
        Update: Partial<FinancialRecord>;
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
      financial_type: FinancialType;
      document_type: DocumentType;
    };
    CompositeTypes: Record<string, never>;
  };
};
