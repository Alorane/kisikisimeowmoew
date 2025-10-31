import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { ordersService } from "../services/orders";
import { settingsService } from "../services/settings";
import { getDeviceType } from "../services/repairs";
import {
  sendMessage,
  replaceRepairMessage,
  sendKeyboardMessage,
  fmtPrice,
  normalizePhoneInput,
} from "../utils/bot";
import {
  deviceTypesKeyboard,
  modelsKeyboard,
  issuesKeyboard,
} from "../utils/keyboards";
import { buildIssueResponse } from "../utils/responses";

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

      if (mode === "price" && model && issue) {
        const num = Number(String(text).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(num) || num <= 0) {
          return ctx.reply(
            "Не получилось распознать число. Введи цену в рублях, например 12500.",
          );
        }
        const price = Math.round(num);
        const saved = await repairsService.updatePrice(model, issue, price);
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
          if (payload) {
            await replaceRepairMessage(ctx, payload.text, {
              reply_markup: payload.keyboard,
            });
          }
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "desc" && model && issue) {
        const saved = await repairsService.updateDescription(
          model,
          issue,
          text,
        );
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
          if (payload) {
            await replaceRepairMessage(ctx, payload.text, {
              reply_markup: payload.keyboard,
            });
          }
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "waranty" && model && issue) {
        const waranty = text.trim() || null;
        const saved = await repairsService.updateWaranty(model, issue, waranty);
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
          if (payload) {
            await replaceRepairMessage(ctx, payload.text, {
              reply_markup: payload.keyboard,
            });
          }
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "work_time" && model && issue) {
        const workTime = text.trim() || null;
        const saved = await repairsService.updateWorkTime(
          model,
          issue,
          workTime,
        );
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
          if (payload) {
            await replaceRepairMessage(ctx, payload.text, {
              reply_markup: payload.keyboard,
            });
          }
        } else {
          ctx.reply("Не удалось сохранить изменения. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "delete_issue" && model && issue) {
        if (text.toLowerCase() === "да") {
          const saved = await repairsService.deleteRepair(model, issue);
          if (saved) {
            ctx.reply(`Работа «${issue}» для ${model} удалена.`);
            // go to issues list
            const repairs = repairsService.getRepairs();
            ctx.session.issues = Object.keys(repairs[model] || {});
            await sendKeyboardMessage(
              ctx,
              `📱 Модель: ${model}\nВыбери неисправность:`,
              {
                reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
              },
            );
          } else {
            ctx.reply("Не удалось удалить. Проверь логи.");
          }
        } else {
          ctx.reply("Удаление отменено.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "add_device_type") {
        if (stage === "name") {
          if (!text.trim()) {
            return ctx.reply(
              "Название типа не может быть пустым. Попробуй ещё раз.",
            );
          }
          editor.deviceTypeName = text;
          editor.stage = "pattern";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            `Название: "${text}". Теперь введи регулярное выражение для распознавания устройств этого типа (например: "iphone" или "ipad|apple.*tablet").`,
          );
        }

        if (stage === "pattern") {
          if (!text.trim()) {
            return ctx.reply("Паттерн не может быть пустым. Попробуй ещё раз.");
          }
          try {
            // Test if pattern is valid
            new RegExp(text, "i");
          } catch {
            return ctx.reply(
              "Неверный формат регулярного выражения. Попробуй ещё раз.",
            );
          }

          editor.pattern = text;
          editor.stage = "sort_order";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            `Паттерн: "${text}". Теперь введи порядок сортировки (число, чем меньше - тем выше в списке, например: 1, 2, 3...).`,
          );
        }

        if (stage === "sort_order") {
          const sortOrder = Number(text.trim());
          if (!Number.isInteger(sortOrder) || sortOrder < 0) {
            return ctx.reply(
              "Порядок сортировки должен быть целым положительным числом. Попробуй ещё раз.",
            );
          }

          const deviceTypeName = editor.deviceTypeName;
          const pattern = editor.pattern;

          if (!deviceTypeName || !pattern) {
            ctx.session.adminEdit = undefined;
            return ctx.reply("Ошибка: данные потерялись. Попробуй заново.");
          }

          const saved = await repairsService.addDeviceType({
            name: deviceTypeName,
            pattern: pattern,
            sort_order: sortOrder,
          });

          if (saved) {
            await ctx.reply(`Тип устройства "${deviceTypeName}" добавлен!`);
            // Show updated device types list
            await sendKeyboardMessage(ctx, "Выбери тип устройства:", {
              reply_markup: deviceTypesKeyboard(isAdminMode(ctx)),
            });
          } else {
            ctx.reply("Не удалось добавить тип устройства. Проверь логи.");
          }
          ctx.session.adminEdit = undefined;
          return;
        }
      }

      if (mode === "add_model" && stage === "name") {
        if (!text.trim()) {
          return ctx.reply(
            "Название модели не может быть пустым. Попробуй ещё раз.",
          );
        }
        const deviceType = editor.deviceType;
        if (!deviceType) {
          ctx.session.adminEdit = undefined;
          return ctx.reply(
            "Ошибка: тип устройства не найден. Попробуй заново.",
          );
        }

        // Add a dummy repair to create the model (it will be removed after)
        const tempRepair = await repairsService.addRepair({
          device: text,
          title: "Временная работа",
          price: 100,
          desc: "Временная запись для создания модели",
        });

        if (tempRepair) {
          // Now delete the temporary repair
          await repairsService.deleteRepair(text, "Временная работа");
          await ctx.reply(`Модель "${text}" добавлена к типу "${deviceType}".`);
          // Show updated models list
          await sendKeyboardMessage(ctx, `Выбери модель ${deviceType}:`, {
            reply_markup: modelsKeyboard(deviceType, 0, isAdminMode(ctx)),
          });
        } else {
          ctx.reply("Не удалось добавить модель. Проверь логи.");
        }
        ctx.session.adminEdit = undefined;
        return;
      }

      if (mode === "add_issue" && model) {
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
          editor.desc = text;
          editor.stage = "waranty";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            "Укажи гарантию (например: '30 дней', '6 месяцев' или оставь пустым).",
          );
        }
        if (stage === "waranty") {
          editor.waranty = text.trim() || undefined;
          editor.stage = "work_time";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            "Укажи время выполнения работы (например: '2 часа', '1-2 дня' или оставь пустым).",
          );
        }
        if (stage === "work_time") {
          const title = editor.title || "Новая работа";
          const price = editor.price ?? 0;
          const saved = await repairsService.addRepair({
            device: model,
            title,
            price,
            desc: editor.desc || "",
            waranty: editor.waranty,
            work_time: text.trim() || undefined,
          });
          if (saved) {
            await ctx.reply(`Работа «${title}» добавлена к ${model}.`);
            // Show updated issues list
            const repairs = repairsService.getRepairs();
            ctx.session.issues = Object.keys(repairs[model] || {});
            await sendKeyboardMessage(
              ctx,
              `📱 Модель: ${model}\nВыбери неисправность:`,
              {
                reply_markup: issuesKeyboard(model, isAdminMode(ctx)),
              },
            );
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
        return sendKeyboardMessage(
          ctx,
          `📱 Модель: ${text}\nВыбери неисправность:`,
          {
            reply_markup: issuesKeyboard(text, isAdminMode(ctx)),
          },
        );
      }
    }

    const step = ctx.session?.step;

    if (step === "name") {
      ctx.session.name = text;
      ctx.session.step = "phone";
      return sendMessage(
        ctx,
        "Укажи номер телефона в любом формате: +7 (918) 123-45-67, 89181234567, +79181234567 и т.д.",
      );
    }

    if (step === "phone") {
      const normalized = normalizePhoneInput(text);
      if (!normalized.ok) {
        return ctx.reply(
          "Номер телефона введён некорректно. Укажи номер в формате: +7 (918) 123-45-67, 89181234567 или +79181234567.",
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
      return sendKeyboardMessage(ctx, "Выбери тип устройства из меню ниже:", {
        reply_markup: deviceTypesKeyboard(adminUtils.isAdminMode(ctx)),
      });
    }

    return next();
  });
}
