export interface Order {
  id: number;
  ts: string; // ISO string
  name: string;
  phone: string;
  model: string;
  issue: string;
  price: number;
}

export interface Repair {
  id: number;
  device: string; // e.g. 'iPhone 14 Pro'
  title: string; // e.g. 'Замена экрана'
  price: number;
  desc: string;
  waranty: string | null;
  work_time: string | null;
}

export interface DeviceType {
  id: number;
  name: string; // e.g. 'iPhone', 'iPad', 'MacBook'
  pattern: string; // regex pattern for device matching
  sort_order: number; // for custom sorting
}
