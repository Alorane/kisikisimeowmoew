import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { sendMessage } from "../utils/bot";
import {
  deviceTypesKeyboard,
  modelsKeyboard,
  issuesKeyboard,
} from "../utils/keyboards";
import { buildIssueResponse } from "../utils/responses";

interface AdminUtils {
  isAdmin: (ctx: BotContext) => boolean;
  isAdminMode: (ctx: BotContext) => boolean;
  isPrivateChat: (ctx: BotContext) => boolean;
}

export function registerActions(bot: Bot<BotContext>, adminUtils: AdminUtils) {
  const { isAdminMode, isPrivateChat } = adminUtils;

  bot.callbackQuery(/^nav:([^:]+):(\d+)$/, async (ctx) => {
    const type = ctx.match[1];
    const page = Number(ctx.match[2]);
    try {
      await ctx.editMessageText(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, page),
      });
    } catch {
      // ignore
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^type:(.+)$/s, async (ctx) => {
    const type = ctx.match[1];
    ctx.session.deviceType = type;
    try {
      await ctx.editMessageText(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0),
      });
    } catch {
      await ctx.reply(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0),
      });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("back_models", async (ctx) => {
    const type = ctx.session?.deviceType;
    if (!type) {
      // fallback to device types
      try {
        await ctx.editMessageText("Выбери тип устройства:", {
          reply_markup: deviceTypesKeyboard(),
        });
      } catch {
        await ctx.reply("Выбери тип устройства:", {
          reply_markup: deviceTypesKeyboard(),
        });
      }
      return ctx.answerCallbackQuery();
    }
    try {
      await ctx.editMessageText(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0),
      });
    } catch {
      await ctx.reply(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0),
      });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("back_types", async (ctx) => {
    try {
      await ctx.editMessageText("Выбери тип устройства:", {
        reply_markup: deviceTypesKeyboard(),
      });
    } catch {
      await ctx.reply("Выбери тип устройства:", {
        reply_markup: deviceTypesKeyboard(),
      });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^iss:(\d+)$/, async (ctx) => {
    const idx = Number(ctx.match[1]);
    const { model, issues } = ctx.session;
    if (!model || !issues || !issues[idx]) {
      return ctx.answerCallbackQuery({
        text: "Сессия сброшена, выбери модель заново.",
        show_alert: true,
      });
    }
    const issue = issues[idx];
    const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
    if (!payload) {
      return ctx.answerCallbackQuery({
        text: "Не удалось загрузить работу",
        show_alert: true,
      });
    }

    ctx.session.issue = issue;
    const repairs = repairsService.getRepairs();
    ctx.session.price = repairs[model][issue].price;

    try {
      await ctx.editMessageText(payload.text, {
        reply_markup: payload.keyboard,
      });
    } catch {
      await ctx.reply(payload.text, { reply_markup: payload.keyboard });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("back_issues", async (ctx) => {
    const model = ctx.session?.model;
    if (!model) return ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(`📱 Модель: ${model}\nВыбери неисправность:`, {
        reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
      });
    } catch {
      await ctx.reply(`📱 Модель: ${model}\nВыбери неисправность:`, {
        reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
      });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("order", async (ctx) => {
    if (!isPrivateChat(ctx)) return ctx.answerCallbackQuery();
    ctx.session.step = "name";
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, "Окей! Введи, пожалуйста, как тебя зовут:");
  });

  bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery(/^add_issue:(.+)$/s, async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const model = ctx.match[1];
    const repairs = repairsService.getRepairs();
    if (!repairs[model]) {
      return ctx.answerCallbackQuery({
        text: "Модель не найдена",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "add_issue", model, stage: "title" };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Добавляем новую работу для ${model}. Напиши название работы:`,
    );
  });

  bot.callbackQuery("admin_edit_price", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { model, issue } = ctx.session;
    if (!model || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "price", model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, `Введи новую цену для «${issue}» в ₽ (число).`);
  });

  bot.callbackQuery("admin_edit_desc", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { model, issue } = ctx.session;
    if (!model || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "desc", model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, `Введи новое описание для «${issue}».`);
  });

  bot.callbackQuery("admin_delete_issue", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { model, issue } = ctx.session;
    if (!model || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "delete_issue", model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Точно удалить «${issue}» для ${model}? Это действие нельзя будет отменить. Напиши «да» для подтверждения.`,
    );
  });
}
