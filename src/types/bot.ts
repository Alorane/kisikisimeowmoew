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
  adminEdit?: {
    mode: "add_issue" | "price" | "desc" | "delete_issue";
    model: string;
    issue?: string;
    stage?: "title" | "price" | "desc";
    title?: string;
    price?: number;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;
