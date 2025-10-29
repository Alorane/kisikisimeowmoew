import { supabase } from "../lib/supabase";
import { Order } from "../types/database";

type OrderInput = Omit<Order, "id" | "ts">;

class OrdersService {
  async createOrder(orderInput: OrderInput): Promise<Order | null> {
    const orderToInsert = {
      ...orderInput,
      ts: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(orderToInsert)
      .select();

    if (error) {
      console.error("❌ Error creating order:", error.message);
      return null;
    }

    return data ? (data[0] as Order) : null;
  }
}

export const ordersService = new OrdersService();
