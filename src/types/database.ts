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
}
