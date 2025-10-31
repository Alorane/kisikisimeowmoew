import { Bot } from "grammy";
import type { BotContext } from "../types/bot";
import { repairsService } from "../services/repairs";
import { ordersService } from "../services/orders";
import { settingsService } from "../services/settings";
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
      const { mode, deviceId, issue, stage } = editor;

      if (mode === "price" && deviceId && issue) {
        const num = Number(String(text).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(num) || num <= 0) {
          return ctx.reply(
            "Не получилось распознать число. Введи цену в рублях, например 12500.",
          );
        }
        const price = Math.round(num);
        const saved = await repairsService.updatePrice(deviceId, issue, price);
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(deviceId, issue, isAdminMode(ctx));
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

      if (mode === "desc" && deviceId && issue) {
        const saved = await repairsService.updateDescription(
          deviceId,
          issue,
          text,
        );
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(deviceId, issue, isAdminMode(ctx));
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

      if (mode === "warranty" && deviceId && issue) {
        const warranty = text.trim() || null;
        const saved = await repairsService.updateWarranty(
          deviceId,
          issue,
          warranty,
        );
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(deviceId, issue, isAdminMode(ctx));
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

      if (mode === "work_time" && deviceId && issue) {
        const workTime = text.trim() || null;
        const saved = await repairsService.updateWorkTime(
          deviceId,
          issue,
          workTime,
        );
        if (saved) {
          await ctx.reply("Данные обновлены.");
          const payload = buildIssueResponse(deviceId, issue, isAdminMode(ctx));
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

      if (mode === "delete_issue" && deviceId && issue) {
        if (text.toLowerCase() === "да") {
          const saved = await repairsService.deleteRepair(deviceId, issue);
          if (saved) {
            ctx.reply(`Работа «${issue}» для ${ctx.session.model} удалена.`);
            // go to issues list
            ctx.session.issues = Object.keys(
              repairsService.getRepairsForDevice(deviceId) || {},
            );
            await sendKeyboardMessage(
              ctx,
              `📱 Модель: ${ctx.session.model}\nВыбери неисправность:`,
              {
                reply_markup: issuesKeyboard(
                  ctx.session.model || "",
                  isAdminMode(ctx),
                ),
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
          editor.stage = "sort_order";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            `Название: "${text}". Теперь введи порядок сортировки (число, чем меньше - тем выше в списке, например: 1, 2, 3...).`,
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

          if (!deviceTypeName) {
            ctx.session.adminEdit = undefined;
            return ctx.reply("Ошибка: данные потерялись. Попробуй заново.");
          }

          const saved = await repairsService.addDeviceType({
            name: deviceTypeName,
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

        // Find device type id
        const deviceTypeRecord = repairsService
          .getDeviceTypeRecords()
          .find((dt) => dt.name === deviceType);
        if (!deviceTypeRecord) {
          ctx.reply("Не удалось найти тип устройства. Проверь логи.");
          ctx.session.adminEdit = undefined;
          return;
        }

        // Add device to devices table
        const deviceAdded = await repairsService.addDevice(
          text,
          deviceTypeRecord.id,
        );
        if (deviceAdded) {
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

      if (mode === "add_issue" && deviceId) {
        if (stage === "title") {
          if (!text)
            return ctx.reply(
              "Название не может быть пустым. Попробуй ещё раз.",
            );
          const deviceRepairs =
            repairsService.getRepairsForDevice(deviceId) || {};
          if (deviceRepairs[text]) {
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
          editor.description = text;
          editor.stage = "warranty";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            "Укажи гарантию (например: '30 дней', '6 месяцев' или оставь пустым).",
          );
        }
        if (stage === "warranty") {
          editor.warranty = text.trim() || undefined;
          editor.stage = "work_time";
          ctx.session.adminEdit = editor;
          return ctx.reply(
            "Укажи время выполнения работы (например: '2 часа', '1-2 дня' или оставь пустым).",
          );
        }
        if (stage === "work_time") {
          const title = editor.title || "Новая работа";
          const price = editor.price ?? 0;
          const saved = await repairsService.addRepair(
            deviceId,
            title,
            price,
            editor.description || "",
            editor.warranty,
            text.trim() || undefined,
          );
          if (saved) {
            await ctx.reply(
              `Работа «${title}» добавлена к ${ctx.session.model}.`,
            );
            // Show updated issues list
            ctx.session.issues = Object.keys(
              repairsService.getRepairsForDevice(deviceId) || {},
            );
            await sendKeyboardMessage(
              ctx,
              `📱 Модель: ${ctx.session.model}\nВыбери неисправность:`,
              {
                reply_markup: issuesKeyboard(
                  ctx.session.model || "",
                  isAdminMode(ctx),
                ),
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

    // Try to find device by name
    const device = repairsService.getDevices().find((d) => d.name === text);
    if (device) {
      ctx.session.deviceType = device.device_types?.name || "Другое";
      ctx.session.deviceId = device.id;
      ctx.session.model = text; // keep for backward compatibility
      ctx.session.issues = Object.keys(
        repairsService.getRepairsForDevice(device.id) || {},
      );
      return sendKeyboardMessage(
        ctx,
        `📱 Модель: ${text}\nВыбери неисправность:`,
        {
          reply_markup: issuesKeyboard(text, isAdminMode(ctx)),
        },
      );
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

      const { deviceId, model, issue, price, name, phone } = ctx.session;
      if (!deviceId || !issue || !price || !name || !phone) {
        ctx.session.step = undefined;
        return ctx.reply("Сессия потерялась. Давай начнём сначала: /start");
      }

      const order = await ordersService.createOrder({
        name,
        phone,
        device_id: deviceId,
        issue,
        price,
        status: "pending",
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
