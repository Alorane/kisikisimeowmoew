import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { ordersService } from "../services/orders";
import { settingsService } from "../services/settings";
import { getDeviceType } from "../services/repairs";
import { sendMessage, fmtPrice, normalizePhoneInput } from "../utils/bot";
import { deviceTypesKeyboard, issuesKeyboard } from "../utils/keyboards";

interface AdminUtils {
  isAdminMode: (ctx: BotContext) => boolean;
  isPrivateChat: (ctx: BotContext) => boolean;
}

export function registerTextHandler(
  bot: Bot<BotContext>,
  adminUtils: AdminUtils,
) {
  const { isAdminMode, isPrivateChat } = adminUtils;

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text.trim();

    if (!isPrivateChat(ctx)) return;

    if (isAdminMode(ctx) && ctx.session.adminEdit) {
      const editor = ctx.session.adminEdit;
      const { mode, model, issue, stage } = editor;
      const repairs = repairsService.getRepairs();

      if (mode === "price" && issue) {
        const num = Number(String(text).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(num) || num <= 0) {
          return ctx.reply(
            "Не получилось распознать число. Введи цену в рублях, например 12500.",
          );
        }
        const price = Math.round(num);
        const saved = await repairsService.updatePrice(model, issue, price);
        if (saved) {
          ctx.reply(`Цена для «${issue}» обновлена: ${fmtPrice(price)}.`);
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "desc" && issue) {
        const saved = await repairsService.updateDescription(
          model,
          issue,
          text,
        );
        if (saved) {
          ctx.reply(`Описание для «${issue}» обновлено.`);
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "delete_issue" && issue) {
        if (text.toLowerCase() === "да") {
          const saved = await repairsService.deleteRepair(model, issue);
          if (saved) {
            ctx.reply(`Работа «${issue}» для ${model} удалена.`);
            // go to issues list
            const repairs = repairsService.getRepairs();
            ctx.session.issues = Object.keys(repairs[model] || {});
            await ctx.reply(`📱 Модель: ${model}\nВыбери неисправность:`, {
              reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
            });
          } else {
            ctx.reply("Не удалось удалить. Проверь логи.");
          }
        } else {
          ctx.reply("Удаление отменено.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "add_issue") {
        if (stage === "title") {
          if (!text)
            return ctx.reply(
              "Название не может быть пустым. Попробуй ещё раз.",
            );
          if (repairs[model]?.[text]) {
            return ctx.reply("Такая работа уже есть. Введи другое название.");
          }
          editor.title = text;
          editor.stage = "price";
          ctx.session.adminEdit = editor;
          return ctx.reply("Теперь введи цену в ₽ (число).");
        }
        if (stage === "price") {
          const num = Number(String(text).replace(/[^\d.]/g, ""));
          if (!Number.isFinite(num) || num <= 0) {
            return ctx.reply(
              "Не получилось распознать число. Введи цену в рублях, например 12500.",
            );
          }
          editor.price = Math.round(num);
          editor.stage = "desc";
          ctx.session.adminEdit = editor;
          return ctx.reply("Опиши работу. Можно несколько предложений.");
        }
        if (stage === "desc") {
          const title = editor.title || "Новая работа";
          const price = editor.price ?? 0;
          const saved = await repairsService.addRepair({
            device: model,
            title,
            price,
            desc: text,
          });
          if (saved) {
            ctx.reply(`Работа «${title}» добавлена к ${model}.`);
          } else {
            ctx.reply("Не удалось сохранить изменения. Проверь логи.");
          }
          ctx.session.adminEdit = undefined;
          return;
        }
      }
    }

    const repairs = repairsService.getRepairs();
    const type = getDeviceType(text);
    if (type) {
      const models = repairsService.getModelsForType(type);
      if (models.includes(text)) {
        ctx.session.deviceType = type;
        ctx.session.model = text;
        ctx.session.issues = Object.keys(repairs[text]);
        return ctx.reply(`📱 Модель: ${text}\nВыбери неисправность:`, {
          reply_markup: issuesKeyboard(text, isAdminMode(ctx)),
        });
      }
    }

    const step = ctx.session?.step;

    if (step === "name") {
      ctx.session.name = text;
      ctx.session.step = "phone";
      return sendMessage(
        ctx,
        "Укажи номер телефона: 10 цифр без 8, например 9000000000.",
      );
    }

    if (step === "phone") {
      const normalized = normalizePhoneInput(text);
      if (!normalized.ok) {
        if (normalized.reason === "startsWith8") {
          return ctx.reply(
            "Вводи номер без 8 в начале. Просто 10 цифр, например 9000000000.",
          );
        }
        return ctx.reply(
          "Номер не похож на телефон. Нужны 10 цифр, например 9000000000.",
        );
      }

      ctx.session.phone = normalized.value;

      const { model, issue, price, name, phone } = ctx.session;
      if (!model || !issue || !price || !name || !phone) {
        ctx.session.step = undefined;
        return ctx.reply("Сессия потерялась. Давай начнём сначала: /start");
      }

      const order = await ordersService.createOrder({
        name,
        phone,
        model,
        issue,
        price,
      });

      if (!order) {
        return ctx.reply("Не удалось создать заявку. Попробуй позже.");
      }

      const priceFmt = fmtPrice(price);
      await sendMessage(
        ctx,
        `✅ Заявка оформлена!\n\n` +
          `📄 ID: ${order.id}\n` +
          `👤 ${name}\n` +
          `📞 ${phone}\n` +
          `📱 ${model}\n` +
          `⚙️ ${issue}\n` +
          `💰 ${priceFmt}\n\n` +
          `Мы свяжемся с тобой в ближайшее время.`,
      );

      const notifyTargets = settingsService.getNotifyChatIds();
      for (const chatId of notifyTargets) {
        try {
          await bot.api.sendMessage(
            chatId,
            `🔔 Новая заявка\n\n` +
              `📄 ID: ${order.id}\n` +
              `👤 ${name}\n` +
              `📞 ${phone}\n` +
              `📱 ${model}\n` +
              `⚙️ ${issue}\n` +
              `💰 ${priceFmt}`,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : JSON.stringify(error);
          console.error(`Не удалось уведомить чат ${chatId}:`, message);
        }
      }

      ctx.session.step = undefined;
      return;
    }

    if (!step) {
      return ctx.reply("Выбери тип устройства из меню ниже:", {
        reply_markup: deviceTypesKeyboard(),
      });
    }

    return next();
  });
}
