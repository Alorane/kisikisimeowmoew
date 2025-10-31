import { Context, SessionFlavor } from "grammy";

export interface SessionData {
  model?: string;
  issues?: string[];
  issue?: string;
  price?: number;
  step?: "name" | "phone";
  name?: string;
  phone?: string;
  deviceType?: string;
  lastMessageId?: number;
  repairMessageId?: number;
  adminEdit?: {
    mode: "add_issue" | "price" | "desc" | "waranty" | "work_time" | "delete_issue";
    model: string;
    issue?: string;
    stage?: "title" | "price" | "desc" | "waranty" | "work_time";
    title?: string;
    price?: number;
    desc?: string;
    waranty?: string;
    work_time?: string;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;
