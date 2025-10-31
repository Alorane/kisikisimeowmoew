export interface DeviceType {
  id: number;
  name: string; // e.g. 'iPhone', 'iPad', 'MacBook'
  sort_order: number; // for custom sorting
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: number;
  name: string; // e.g. 'iPhone 14', 'iPhone 14 Pro', 'MacBook Pro 16"'
  device_type_id: number;
  created_at: string;
  updated_at: string;
  device_types?: DeviceType; // populated by joins
}

export interface Repair {
  id: number;
  device_id: number; // foreign key to devices table
  title: string; // e.g. 'Замена экрана'
  price: number;
  description: string | null;
  warranty: string | null;
  work_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  ts: string; // ISO string
  name: string;
  phone: string;
  device_id: number | null; // foreign key to devices table (nullable)
  issue: string;
  price: number;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface NotificationChat {
  chat_id: string;
  created_at: string;
  updated_at: string;
}
