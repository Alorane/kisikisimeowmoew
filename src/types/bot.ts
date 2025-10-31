import { Context, SessionFlavor } from "grammy";

export interface SessionData {
  deviceId?: number;
  model?: string; // backward compatibility
  issues?: string[];
  issue?: string;
  price?: number;
  step?: "name" | "phone";
  name?: string;
  phone?: string;
  deviceType?: string;
  lastMessageId?: number;
  repairMessageId?: number;
  keyboardMessageId?: number;
  adminEdit?: {
    mode:
      | "add_issue"
      | "price"
      | "desc"
      | "warranty"
      | "work_time"
      | "delete_issue"
      | "add_device_type"
      | "add_device"
      | "add_model";
    deviceId?: number;
    model?: string; // backward compatibility
    deviceType?: string;
    deviceTypeName?: string;
    issue?: string;
    stage?:
      | "title"
      | "price"
      | "desc"
      | "warranty"
      | "work_time"
      | "name"
      | "sort_order"
      | "device_type";
    title?: string;
    price?: number;
    description?: string;
    warranty?: string;
    work_time?: string;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;
