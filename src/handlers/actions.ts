import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import {
  sendMessage,
  sendRepairMessage,
  sendKeyboardMessage,
} from "../utils/bot";
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
        reply_markup: modelsKeyboard(type, page, isAdminMode(ctx)),
      });
    } catch {
      // ignore
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^type:(.+)$/s, async (ctx) => {
    const type = ctx.match[1];
    console.log(`📱 User selected device type: ${type}`);
    ctx.session.deviceType = type;
    try {
      console.log(`📝 Editing message for type selection: ${type}`);
      await ctx.editMessageText(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0, isAdminMode(ctx)),
      });
      console.log(`✅ Successfully edited message for type: ${type}`);
    } catch (error) {
      console.log(
        `❌ Failed to edit message for type ${type}, trying reply:`,
        error,
      );
      await ctx.reply(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0, isAdminMode(ctx)),
      });
      console.log(`✅ Successfully replied for type: ${type}`);
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^mdl:(.+):(.+)$/s, async (ctx) => {
    const deviceType = ctx.match[1];
    const model = ctx.match[2];
    console.log(`📱 User selected model: ${model} (type: ${deviceType})`);

    // Find device by name
    const device = repairsService.getDevices().find((d) => d.name === model);
    if (!device) {
      console.error(`❌ Device not found: ${model}`);
      return ctx.answerCallbackQuery({
        text: "Устройство не найдено",
        show_alert: true,
      });
    }

    ctx.session.deviceId = device.id;
    ctx.session.model = model; // keep for backward compatibility
    ctx.session.issues = Object.keys(
      repairsService.getRepairsForDevice(device.id) || {},
    );

    console.log(
      `🔧 Available issues for ${model} (id: ${device.id}): ${ctx.session.issues.join(", ")}`,
    );

    try {
      console.log(`📝 Editing message for model selection: ${model}`);
      await ctx.editMessageText(`📱 Модель: ${model}\nВыбери неисправность:`, {
        reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
      });
      console.log(`✅ Successfully edited message for model: ${model}`);
    } catch (error) {
      console.log(
        `❌ Failed to edit message for model ${model}, trying reply:`,
        error,
      );
      await ctx.reply(`📱 Модель: ${model}\nВыбери неисправность:`, {
        reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
      });
      console.log(`✅ Successfully replied for model: ${model}`);
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
        await sendKeyboardMessage(ctx, "Выбери тип устройства:", {
          reply_markup: deviceTypesKeyboard(),
        });
      }
      return ctx.answerCallbackQuery();
    }
    try {
      await ctx.editMessageText(`Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0, isAdminMode(ctx)),
      });
    } catch {
      await sendKeyboardMessage(ctx, `Выбери модель ${type}:`, {
        reply_markup: modelsKeyboard(type, 0, isAdminMode(ctx)),
      });
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("back_types", async (ctx) => {
    try {
      await ctx.editMessageText("Выбери тип устройства:", {
        reply_markup: deviceTypesKeyboard(isAdminMode(ctx)),
      });
    } catch {
      await sendKeyboardMessage(ctx, "Выбери тип устройства:", {
        reply_markup: deviceTypesKeyboard(isAdminMode(ctx)),
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
    const deviceId = ctx.session.deviceId;
    if (!deviceId) {
      return ctx.answerCallbackQuery({
        text: "Устройство не найдено",
        show_alert: true,
      });
    }

    const payload = buildIssueResponse(deviceId, issue, isAdminMode(ctx));
    if (!payload) {
      return ctx.answerCallbackQuery({
        text: "Не удалось загрузить работу",
        show_alert: true,
      });
    }

    ctx.session.issue = issue;
    const deviceRepairs = repairsService.getRepairsForDevice(deviceId);
    ctx.session.price = deviceRepairs?.[issue]?.price;

    try {
      await ctx.editMessageText(payload.text, {
        reply_markup: payload.keyboard,
      });
      ctx.session.repairMessageId = ctx.callbackQuery?.message?.message_id;
    } catch {
      await sendRepairMessage(ctx, payload.text, {
        reply_markup: payload.keyboard,
      });
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
      await sendKeyboardMessage(
        ctx,
        `📱 Модель: ${model}\nВыбери неисправность:`,
        {
          reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
        },
      );
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("order", async (ctx) => {
    if (!isPrivateChat(ctx)) return ctx.answerCallbackQuery();
    ctx.session.step = "name";
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, "Окей! Введи, пожалуйста, как тебя зовут:");
  });

  bot.callbackQuery("add_device_type", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    ctx.session.adminEdit = { mode: "add_device_type", stage: "name" };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      "Введи название нового типа устройства (например: 'iPhone', 'MacBook', 'iPad'):",
    );
  });

  bot.callbackQuery(/^add_model:(.+)$/s, async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const deviceType = ctx.match[1];
    ctx.session.adminEdit = { mode: "add_model", deviceType, stage: "name" };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Введи название новой модели для типа "${deviceType}" (например: 'iPhone 15 Pro')`,
    );
  });

  bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery(/^add_issue:(.+)$/s, async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const model = ctx.match[1];
    const device = repairsService.getDevices().find((d) => d.name === model);
    if (!device) {
      return ctx.answerCallbackQuery({
        text: "Модель не найдена",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = {
      mode: "add_issue",
      deviceId: ctx.session.deviceId,
      model,
      stage: "title",
    };
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
    const { deviceId, model, issue } = ctx.session;
    if (!deviceId || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "price", deviceId, model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, `Введи новую цену для «${issue}» в ₽ (число).`);
  });

  bot.callbackQuery("admin_edit_desc", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { deviceId, model, issue } = ctx.session;
    if (!deviceId || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "desc", deviceId, model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(ctx, `Введи новое описание для «${issue}».`);
  });

  bot.callbackQuery("admin_edit_waranty", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { deviceId, model, issue } = ctx.session;
    if (!deviceId || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "warranty", deviceId, model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Введи новую гарантию для «${issue}» (например: '30 дней', '6 месяцев').`,
    );
  });

  bot.callbackQuery("admin_edit_work_time", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { deviceId, model, issue } = ctx.session;
    if (!deviceId || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "work_time", deviceId, model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Введи новое время выполнения для «${issue}» (например: '2 часа', '1-2 дня').`,
    );
  });

  bot.callbackQuery("admin_delete_issue", async (ctx) => {
    if (!isAdminMode(ctx)) {
      return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    }
    const { deviceId, model, issue } = ctx.session;
    if (!deviceId || !issue) {
      return ctx.answerCallbackQuery({
        text: "Сначала выбери работу",
        show_alert: true,
      });
    }
    ctx.session.adminEdit = { mode: "delete_issue", deviceId, model, issue };
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    await sendMessage(
      ctx,
      `Точно удалить «${issue}» для ${model}? Это действие нельзя будет отменить. Напиши «да» для подтверждения.`,
    );
  });
}
