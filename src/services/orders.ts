import { supabase } from "../lib/supabase";
import { Order } from "../types/database";

type OrderInput = Omit<Order, "id" | "ts" | "created_at" | "updated_at">;

class OrdersService {
  async createOrder(orderInput: OrderInput): Promise<Order | null> {
    const { data, error } = await supabase.from("orders").insert(orderInput)
      .select(`
        *,
        devices (
          id,
          name,
          device_types (
            name
          )
        )
      `);

    if (error) {
      console.error("❌ Error creating order:", error.message);
      return null;
    }

    return data ? (data[0] as Order) : null;
  }

  async getOrders(limit = 50): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        devices (
          id,
          name,
          device_types (
            name
          )
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Error getting orders:", error.message);
      return [];
    }

    return data as Order[];
  }

  async updateOrderStatus(
    id: number,
    status: Order["status"],
  ): Promise<boolean> {
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .match({ id });

    if (error) {
      console.error("❌ Error updating order status:", error.message);
      return false;
    }

    return true;
  }
}

export const ordersService = new OrdersService();
