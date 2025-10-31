import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { settingsService } from "../services/settings";
import { sendMessage, sendRepairMessage } from "../utils/bot";
import { deviceTypesKeyboard, issuesKeyboard } from "../utils/keyboards";
import { buildIssueResponse } from "../utils/responses";

interface AdminUtils {
  isAdmin: (ctx: BotContext) => boolean;
  isPrivateChat: (ctx: BotContext) => boolean;
  isAdminMode: (ctx: BotContext) => boolean;
  setAdminMode: (ctx: BotContext, enabled: boolean) => void;
}

export function registerCommands(
  bot: Bot<BotContext>,
  ADMIN_IDS: string[],
  adminUtils: AdminUtils,
  setCommandsForChat?: (chatId: number, isAdmin: boolean) => Promise<void>,
) {
  const { isAdmin, isPrivateChat, isAdminMode, setAdminMode } = adminUtils;

  bot.command("start", async (ctx) => {
    if (!isPrivateChat(ctx)) return;
    ctx.session = {};

    // Set appropriate commands for this chat
    if (setCommandsForChat && ctx.chat?.id) {
      const isUserAdmin = isAdmin(ctx);
      await setCommandsForChat(ctx.chat.id, isUserAdmin && isAdminMode(ctx));
    }

    await sendMessage(
      ctx,
      "Привет! 👋 Я помогу рассчитать ремонт. Сначала выбери тип устройства:",
      { reply_markup: deviceTypesKeyboard() },
    );
  });

  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply("Нет доступа.");
    }
    if (!isPrivateChat(ctx)) {
      return ctx.reply("Админка доступна только в личном чате с ботом.");
    }
    const message = ctx.message;
    if (!message || !("text" in message)) return;
    const [, ...rest] = (message.text || "").trim().split(/\s+/);
    const arg = rest.join(" ").toLowerCase();
    ctx.session = ctx.session || {};
    if (arg === "off" || arg === "exit" || arg === "stop") {
      setAdminMode(ctx, false);
      ctx.session.adminEdit = undefined;

      // Reset to basic commands for this chat
      if (setCommandsForChat && ctx.chat?.id) {
        await setCommandsForChat(ctx.chat.id, false);
      }

      return ctx.reply("Админ-режим выключен. Кнопки и команды скрыты.");
    }

    const alreadyEnabled = isAdminMode(ctx);
    setAdminMode(ctx, true);

    if (alreadyEnabled) {
      return ctx.reply("Админ-режим уже включён.");
    }

    // Set admin commands for this chat
    if (setCommandsForChat && ctx.chat?.id) {
      await setCommandsForChat(ctx.chat.id, true);
    }

    await sendMessage(
      ctx,
      `Админ-режим включён (ID: ${ctx.from?.id || "unknown"}). Повтори выбор модели и неисправности, чтобы увидеть кнопки редактирования.`,
    );

    const { model, issue } = ctx.session;
    const repairs = repairsService.getRepairs();
    if (model && issue) {
      const payload = buildIssueResponse(model, issue, true);
      if (payload) {
        await sendRepairMessage(ctx, payload.text, {
          reply_markup: payload.keyboard,
        });
        return;
      }
    }
    if (model && repairs[model]) {
      await sendMessage(ctx, `📱 Модель: ${model}\nВыбери неисправность:`, {
        reply_markup: issuesKeyboard(model, true),
      });
      return;
    }
    await sendMessage(ctx, "Выбери тип устройства:", {
      reply_markup: deviceTypesKeyboard(),
    });
  });

  bot.command("models", async (ctx) => {
    if (!isPrivateChat(ctx)) return;
    await sendMessage(ctx, "Выбери тип устройства:", {
      reply_markup: deviceTypesKeyboard(),
    });
  });

  bot.command("reload", async (ctx) => {
    if (!isAdmin(ctx)) {
      if (isPrivateChat(ctx))
        await ctx.reply("Команда доступна только администратору.");
      return;
    }
    if (!isPrivateChat(ctx)) {
      return ctx.reply("Перезагрузка доступна только в личном чате.");
    }
    await repairsService.loadRepairs();
    await ctx.reply("🔄 Прайс перезагружен из базы данных.");
  });

  bot.command("notify_here", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply("Команда доступна только администратору.");
    }
    const chatId = String(ctx.chat?.id || "");
    if (!chatId) {
      return ctx.reply("Не удалось определить чат.");
    }
    const ok = await settingsService.addNotifyChat(chatId);
    if (ok) {
      await ctx.reply(
        "✅ Этот чат теперь получает уведомления о новых заявках.",
      );
    } else {
      await ctx.reply("Не удалось сохранить настройки. Проверь логи.");
    }
  });

  bot.command("stop_notify", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply("Команда доступна только администратору.");
    }
    const chatId = String(ctx.chat?.id || "");
    if (!chatId) {
      return ctx.reply("Не удалось определить чат.");
    }
    const ok = await settingsService.removeNotifyChat(chatId);
    if (ok) {
      await ctx.reply(
        "🔕 Этот чат больше не получает уведомления. Если нужно снова — /notify_here.",
      );
    } else {
      await ctx.reply("Не удалось обновить настройки. Проверь логи.");
    }
  });

  bot.command("notify_list", async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply("Команда доступна только администратору.");
    }
    const chats = settingsService.getNotifyChatIds();
    if (!chats.length) {
      return ctx.reply(
        "Уведомления никуда не отправляются. Используй /notify_here в нужном чате.",
      );
    }
    const lines = chats.map((id) => `• ${id}`).join("\n");
    return ctx.reply(`Сейчас уведомления идут в:\n${lines}`);
  });
}
