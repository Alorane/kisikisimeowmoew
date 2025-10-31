import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { settingsService } from "../services/settings";
import {
  sendMessage,
  sendRepairMessage,
  sendKeyboardMessage,
} from "../utils/bot";
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
    console.log(`🚀 Command /start triggered for chat ${ctx.chat?.id}`);
    if (!isPrivateChat(ctx)) return;

    // Don't reset the entire session, just reset navigation state
    ctx.session.model = undefined;
    ctx.session.issues = undefined;
    ctx.session.issue = undefined;
    ctx.session.price = undefined;
    ctx.session.deviceType = undefined;
    ctx.session.step = undefined;
    ctx.session.name = undefined;
    ctx.session.phone = undefined;
    // Keep keyboardMessageId and repairMessageId to allow deletion of previous keyboards

    // Set appropriate commands for this chat
    if (setCommandsForChat && ctx.chat?.id) {
      const isUserAdmin = isAdmin(ctx);
      await setCommandsForChat(ctx.chat.id, isUserAdmin && isAdminMode(ctx));
    }

    await sendKeyboardMessage(
      ctx,
      "Привет! 👋 Я помогу рассчитать ремонт. Сначала выбери тип устройства:",
      { reply_markup: deviceTypesKeyboard(isAdminMode(ctx)) },
    );
  });

  bot.command("admin", async (ctx) => {
    console.log(
      `👑 Command /admin triggered for chat ${ctx.chat?.id}, user ${ctx.from?.id}`,
    );
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

      // Delete previous keyboard messages when exiting admin mode
      const chatId = ctx.chat?.id;
      if (chatId) {
        const messageIds = [
          ctx.session.keyboardMessageId,
          ctx.session.repairMessageId,
          ctx.session.lastMessageId,
        ].filter(Boolean) as number[];

        for (const messageId of messageIds) {
          try {
            await ctx.api.deleteMessage(chatId, messageId);
            console.log(`🗑️ Deleted old message: ${messageId}`);
          } catch (error) {
            // Ignore errors if message doesn't exist or can't be deleted
            console.warn(`⚠️ Could not delete message ${messageId}:`, error);
          }
        }
      }

      // Clear message IDs
      ctx.session.keyboardMessageId = undefined;
      ctx.session.repairMessageId = undefined;
      ctx.session.lastMessageId = undefined;

      // Clear current selection
      ctx.session.deviceId = undefined;
      ctx.session.model = undefined;
      ctx.session.issues = undefined;
      ctx.session.issue = undefined;

      // Reset to basic commands for this chat
      if (setCommandsForChat && ctx.chat?.id) {
        await setCommandsForChat(ctx.chat.id, false);
      }

      return ctx.reply("Админ-режим выключен. Старые клавиатуры удалены.");
    }

    const alreadyEnabled = isAdminMode(ctx);
    setAdminMode(ctx, true);

    if (alreadyEnabled) {
      return ctx.reply("Админ-режим уже включён.");
    }

    // Delete previous keyboard messages to avoid confusion
    const chatId = ctx.chat?.id;
    if (chatId) {
      const messageIds = [
        ctx.session.keyboardMessageId,
        ctx.session.repairMessageId,
        ctx.session.lastMessageId,
      ].filter(Boolean) as number[];

      for (const messageId of messageIds) {
        try {
          await ctx.api.deleteMessage(chatId, messageId);
          console.log(`🗑️ Deleted old message: ${messageId}`);
        } catch (error) {
          // Ignore errors if message doesn't exist or can't be deleted
          console.warn(`⚠️ Could not delete message ${messageId}:`, error);
        }
      }
    }

    // Clear message IDs to prevent conflicts
    ctx.session.keyboardMessageId = undefined;
    ctx.session.repairMessageId = undefined;
    ctx.session.lastMessageId = undefined;

    // Clear current selection to force fresh start
    ctx.session.deviceId = undefined;
    ctx.session.model = undefined;
    ctx.session.issues = undefined;
    ctx.session.issue = undefined;

    // Set admin commands for this chat
    if (setCommandsForChat && ctx.chat?.id) {
      await setCommandsForChat(ctx.chat.id, true);
    }

    await sendMessage(
      ctx,
      `Админ-режим включён (ID: ${ctx.from?.id || "unknown"}). Старые клавиатуры удалены - выбери тип устройства заново.`,
    );

    const { deviceId, model, issue } = ctx.session;
    if (deviceId && issue) {
      const payload = buildIssueResponse(deviceId, issue, true);
      if (payload) {
        await sendRepairMessage(ctx, payload.text, {
          reply_markup: payload.keyboard,
        });
        return;
      }
    }
    if (deviceId && model) {
      await sendKeyboardMessage(ctx, `📱 Модель: ${model}\nВыбери услугу:`, {
        reply_markup: issuesKeyboard(model, true),
      });
      return;
    }
    await sendKeyboardMessage(ctx, "Выбери тип устройства:", {
      reply_markup: deviceTypesKeyboard(isAdminMode(ctx)),
    });
  });

  bot.command("models", async (ctx) => {
    if (!isPrivateChat(ctx)) return;
    await sendKeyboardMessage(ctx, "Выбери тип устройства:", {
      reply_markup: deviceTypesKeyboard(isAdminMode(ctx)),
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
