import "dotenv/config";
import { Bot, session } from "grammy";
import type { BotContext, SessionData } from "./types/bot";
import { repairsService } from "./services/repairs";
import { settingsService } from "./services/settings";
import { createAdminUtils } from "./utils/bot";
import { registerCommands } from "./handlers/commands";
import { registerActions } from "./handlers/actions";
import { registerTextHandler } from "./handlers/text";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not set in .env");
  process.exit(1);
}

const ADMIN_IDS = (process.env.ADMIN_ID || process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const bot = new Bot<BotContext>(BOT_TOKEN);

// Middleware
bot.use(
  session({
    initial: (): SessionData => ({}),
  }),
);

// Admin utilities
const adminUtils = createAdminUtils(ADMIN_IDS);

// Function to set commands based on admin status
async function setCommandsForChat(chatId: number, isAdmin: boolean) {
  try {
    const commands = [
      { command: "start", description: "Начать работу с ботом" },
      { command: "models", description: "Выбрать тип устройства" },
    ];

    if (isAdmin) {
      commands.push(
        { command: "admin", description: "Включить/выключить админ режим" },
        { command: "reload", description: "Перезагрузить прайс-лист" },
        {
          command: "notify_here",
          description: "Включить уведомления в этом чате",
        },
        {
          command: "stop_notify",
          description: "Отключить уведомления в этом чате",
        },
        { command: "notify_list", description: "Список чатов с уведомлениями" },
      );
    }

    await bot.api.setMyCommands(commands, {
      scope: { type: "chat", chat_id: chatId },
    });
  } catch (error) {
    console.warn(`Не удалось установить команды для чата ${chatId}:`, error);
  }
}

// Register handlers
registerCommands(bot, ADMIN_IDS, adminUtils, setCommandsForChat);
registerActions(bot, adminUtils);
registerTextHandler(bot, adminUtils);

// Error handling
bot.catch((err) => {
  console.error("Error in bot:", err);
});

// Main function
async function main() {
  console.log("🚀 Starting bot initialization...");
  console.log(`👑 Admin IDs: ${ADMIN_IDS.join(", ")}`);

  console.log("📡 Loading repairs from database...");
  await repairsService.loadRepairs();

  console.log("📢 Loading notification settings...");
  await settingsService.loadNotifyChats(ADMIN_IDS);

  bot.start();
  console.log("🚀 Бот запущен! Админка и клиентский поток работают стабильно.");
  if (ADMIN_IDS.length) console.log("👑 ADMIN_IDs =", ADMIN_IDS.join(", "));
}

main().catch((e) => {
  console.error("❌ Ошибка запуска бота:", e);
});
