import { supabase } from "../lib/supabase";

class SettingsService {
  private notifyChats: string[] = [];

  async loadNotifyChats(adminIds: string[]) {
    const { data, error } = await supabase
      .from("notification_chats")
      .select("chat_id");
    if (error) {
      console.error("❌ Error loading notification chats:", error.message);
      this.notifyChats = [...adminIds];
      return;
    }

    const chatIds = data.map((r: { chat_id: string }) => r.chat_id);
    const allChats = new Set([...chatIds, ...adminIds]);
    this.notifyChats = Array.from(allChats);
    console.log(`✅ Loaded ${this.notifyChats.length} notification chats.`);
  }

  getNotifyChatIds(): readonly string[] {
    return this.notifyChats;
  }

  async addNotifyChat(chatId: string): Promise<boolean> {
    if (this.notifyChats.includes(chatId)) {
      return true;
    }

    const { error } = await supabase
      .from("notification_chats")
      .insert({ chat_id: chatId });
    if (error) {
      console.error("❌ Error adding notification chat:", error.message);
      return false;
    }

    this.notifyChats.push(chatId);
    return true;
  }

  async removeNotifyChat(chatId: string): Promise<boolean> {
    if (!this.notifyChats.includes(chatId)) {
      return true;
    }

    const { error } = await supabase
      .from("notification_chats")
      .delete()
      .eq("chat_id", chatId);
    if (error) {
      console.error("❌ Error removing notification chat:", error.message);
      return false;
    }
    this.notifyChats = this.notifyChats.filter((id) => id !== chatId);
    return true;
  }
}

export const settingsService = new SettingsService();
