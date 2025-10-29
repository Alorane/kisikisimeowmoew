import "dotenv/config";
import { Telegraf, Markup, session, Context } from "telegraf";
import { repairsService } from "./services/repairs";
import { ordersService } from "./services/orders";
import { settingsService } from "./services/settings";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not set in .env");
  process.exit(1);
}

const ADMIN_IDS = (process.env.ADMIN_ID || process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface SessionData {
  model?: string;
  issues?: string[];
  issue?: string;
  price?: number;
  step?: "name" | "phone";
  name?: string;
  phone?: string;
  adminEdit?: {
    mode: "add_issue" | "price" | "desc";
    model: string;
    issue?: string;
    stage?: "title" | "price" | "desc";
    title?: string;
    price?: number;
  };
}

interface BotContext extends Context {
  session: SessionData;
}

const bot = new Telegraf<BotContext>(BOT_TOKEN);

bot.use(session());

const fmtPrice = (n: number | string | null | undefined) => {
  const num =
    typeof n === "string"
      ? Number(String(n).replace(/[^\d.]/g, ""))
      : Number(n);
  if (!Number.isFinite(num)) return `${n} ₽`;
  return `${num.toLocaleString("ru-RU")} ₽`;
};

const descEnhancers = [
  {
    match: /экран/i,
    extra:
      "Каждый дисплей проходит проверку на точность цветов и яркость, тачскрин тестируем в 20 точках.",
  },
  {
    match: /аккумулятор/i,
    extra:
      "Перед выдачей делаем цикл быстрой и медленной зарядки, чтобы убедиться в стабильности питания.",
  },
  {
    match: /корпус/i,
    extra:
      "Переносим все кнопки и антенны аккуратно, чтобы сохранить заводскую геометрию и прочность.",
  },
  {
    match: /камера/i,
    extra:
      "Используем антистатическую зону, чтобы не допустить пыли и засветов на новом модуле.",
  },
  {
    match: /порта зарядки|заряд/i,
    extra:
      "Также чистим плату от окислов и меняем мелкие элементы, если они влияют на стабильность зарядки.",
  },
  {
    match: /стекла/i,
    extra:
      "Стекло клеим в прессе под вакуумом, чтобы не было пыли и равномерно лег поляризатор.",
  },
];

const buildDescription = (issue: string, base = "") => {
  const extras = descEnhancers
    .filter(({ match }) => match.test(issue))
    .map(({ extra }) => extra);
  if (!extras.length)
    return (
      base || "Сервисная работа. Оригинальные или проверенные комплектующие."
    );
  const unique = Array.from(new Set(extras));
  return `${
    base || "Сервисная работа. Оригинальные или проверенные комплектующие."
  }\n\n${unique.join("\n")}`;
};

const isAdmin = (ctx: BotContext) => {
  if (!ADMIN_IDS.length) return false;
  const id = ctx.from?.id;
  return id != null && ADMIN_IDS.includes(String(id));
};

const isPrivateChat = (ctx: BotContext) => ctx.chat?.type === "private";

const adminModeSet = new Set<string>();
const adminKey = (ctx: BotContext) => {
  const id = ctx.from?.id;
  return id != null ? String(id) : null;
};
const isAdminMode = (ctx: BotContext) => {
  if (!isAdmin(ctx)) return false;
  const key = adminKey(ctx);
  return key ? adminModeSet.has(key) : false;
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const normalizePhoneInput = (raw: string) => {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty" };
  if (digits.startsWith("8")) return { ok: false, reason: "startsWith8" };
  if (digits.length === 10) return { ok: true, value: `+7${digits}` };
  if (digits.length === 11 && digits.startsWith("7")) {
    return { ok: true, value: `+7${digits.slice(1)}` };
  }
  return { ok: false, reason: "length" };
};

function modelsKeyboard(page = 0) {
  const all = repairsService.getModels();
  const perPage = 12;
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = all.slice(p * perPage, p * perPage + perPage);

  const rows = chunk(
    slice.map((m) => Markup.button.callback(m, `mdl:${p}:${m}`)),
    2,
  );
  const nav = [];
  if (pages > 1) {
    nav.push(
      Markup.button.callback("⏮️", `nav:0`),
      Markup.button.callback("◀️", `nav:${Math.max(0, p - 1)}`),
      Markup.button.callback(`${p + 1}/${pages}`, "noop"),
      Markup.button.callback("▶️", `nav:${Math.min(pages - 1, p + 1)}`),
      Markup.button.callback("⏭️", `nav:${pages - 1}`),
    );
  }
  const keyboardRows = rows.length
    ? [...rows]
    : [[Markup.button.callback("↻ Обновить", `nav:${p}`)]];
  keyboardRows.push(
    nav.length ? nav : [Markup.button.callback("↻ Обновить", `nav:${p}`)],
  );
  return Markup.inlineKeyboard(keyboardRows);
}

function issuesKeyboard(model: string, admin = false) {
  const repairs = repairsService.getRepairs();
  const entries = Object.keys(repairs[model] || {});
  const rows = chunk(
    entries.map((issue, i) => Markup.button.callback(issue, `iss:${i}`)),
    1,
  );
  if (admin) {
    rows.push([
      Markup.button.callback("➕ Добавить работу", `add_issue:${model}`),
    ]);
  }
  rows.push([Markup.button.callback("🔙 Назад к моделям", "back_models")]);
  return Markup.inlineKeyboard(rows);
}

function orderKeyboard(admin = false) {
  const rows = [
    [Markup.button.callback("📝 Оформить заявку", "order")],
    [Markup.button.callback("🔙 К неисправностям", "back_issues")],
  ];
  if (admin) {
    rows.unshift([
      Markup.button.callback("✏️ Цена", "admin_edit_price"),
      Markup.button.callback("📝 Описание", "admin_edit_desc"),
    ]);
  }
  return Markup.inlineKeyboard(rows);
}

function buildIssueResponse(model: string, issue: string, admin = false) {
  const repairs = repairsService.getRepairs();
  const item = repairs[model]?.[issue];
  if (!item) return null;
  const price = fmtPrice(item.price);
  const desc = buildDescription(issue, item.desc);
  const text =
    `📱 ${model}\n` + `⚙️ ${issue}\n` + `💰 ${price}\n` + `ℹ️ ${desc}`;
  return { text, keyboard: orderKeyboard(admin) };
}

bot.start(async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  ctx.session = {};
  await ctx.reply(
    "Привет! 👋 Я помогу рассчитать ремонт. Сначала выбери модель iPhone:",
    modelsKeyboard(0),
  );
});

bot.action(/^nav:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  try {
    await ctx.editMessageReplyMarkup(modelsKeyboard(page).reply_markup);
  } catch {
    await ctx.reply("Выбери модель:", modelsKeyboard(page));
  }
  return ctx.answerCbQuery();
});

bot.action(/^mdl:(\d+):(.+)$/s, async (ctx) => {
  const model = ctx.match[2];
  const repairs = repairsService.getRepairs();
  if (!repairs[model]) {
    return ctx.answerCbQuery("Модель не найдена", { show_alert: true });
  }
  ctx.session.model = model;
  ctx.session.issues = Object.keys(repairs[model]);
  try {
    await ctx.editMessageText(
      `📱 Модель: ${model}\nВыбери неисправность:`,
      issuesKeyboard(model, isAdminMode(ctx)),
    );
  } catch {
    await ctx.reply(
      `📱 Модель: ${model}\nВыбери неисправность:`,
      issuesKeyboard(model, isAdminMode(ctx)),
    );
  }
  return ctx.answerCbQuery();
});

bot.action("back_models", async (ctx) => {
  try {
    await ctx.editMessageText("Выбери модель:", modelsKeyboard(0));
  } catch {
    await ctx.reply("Выбери модель:", modelsKeyboard(0));
  }
  return ctx.answerCbQuery();
});

bot.action(/^iss:(\d+)$/, async (ctx) => {
  const idx = Number(ctx.match[1]);
  const { model, issues } = ctx.session || {};
  if (!model || !issues || !issues[idx]) {
    return ctx.answerCbQuery("Сессия сброшена, выбери модель заново.", {
      show_alert: true,
    });
  }
  const issue = issues[idx];
  const payload = buildIssueResponse(model, issue, isAdminMode(ctx));
  if (!payload) {
    return ctx.answerCbQuery("Не удалось загрузить работу", {
      show_alert: true,
    });
  }

  ctx.session.issue = issue;
  const repairs = repairsService.getRepairs();
  ctx.session.price = repairs[model][issue].price;

  try {
    await ctx.editMessageText(payload.text, payload.keyboard);
  } catch {
    await ctx.reply(payload.text, payload.keyboard);
  }
  return ctx.answerCbQuery();
});

bot.action("back_issues", async (ctx) => {
  const model = ctx.session?.model;
  if (!model) return ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      `📱 Модель: ${model}\nВыбери неисправность:`,
      issuesKeyboard(model, isAdminMode(ctx)),
    );
  } catch {
    await ctx.reply(
      `📱 Модель: ${model}\nВыбери неисправность:`,
      issuesKeyboard(model, isAdminMode(ctx)),
    );
  }
  return ctx.answerCbQuery();
});

bot.action("order", async (ctx) => {
  if (!isPrivateChat(ctx)) return ctx.answerCbQuery();
  ctx.session.step = "name";
  await ctx.answerCbQuery();
  await ctx.reply("Окей! Введи, пожалуйста, как тебя зовут:");
});

bot.action("noop", (ctx) => ctx.answerCbQuery());

bot.action(/^add_issue:(.+)$/s, async (ctx) => {
  if (!isAdminMode(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }
  const model = ctx.match[1];
  const repairs = repairsService.getRepairs();
  if (!repairs[model]) {
    return ctx.answerCbQuery("Модель не найдена", { show_alert: true });
  }
  ctx.session.adminEdit = { mode: "add_issue", model, stage: "title" };
  ctx.session.step = undefined;
  await ctx.answerCbQuery();
  await ctx.reply(
    `Добавляем новую работу для ${model}. Напиши название работы:`,
  );
});

bot.action("admin_edit_price", async (ctx) => {
  if (!isAdminMode(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }
  const { model, issue } = ctx.session || {};
  if (!model || !issue) {
    return ctx.answerCbQuery("Сначала выбери работу", { show_alert: true });
  }
  ctx.session.adminEdit = { mode: "price", model, issue };
  ctx.session.step = undefined;
  await ctx.answerCbQuery();
  await ctx.reply(`Введи новую цену для «${issue}» в ₽ (число).`);
});

bot.action("admin_edit_desc", async (ctx) => {
  if (!isAdminMode(ctx)) {
    return ctx.answerCbQuery("Нет доступа", { show_alert: true });
  }
  const { model, issue } = ctx.session || {};
  if (!model || !issue) {
    return ctx.answerCbQuery("Сначала выбери работу", { show_alert: true });
  }
  ctx.session.adminEdit = { mode: "desc", model, issue };
  ctx.session.step = undefined;
  await ctx.answerCbQuery();
  await ctx.reply(`Введи новое описание для «${issue}».`);
});

bot.on("text", async (ctx, next) => {
  const message = ctx.message;
  if (!("text" in message)) return next();

  const text = message.text.trim();

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
      const saved = await repairsService.updateDescription(model, issue, text);
      if (saved) {
        ctx.reply(`Описание для «${issue}» обновлено.`);
      } else {
        ctx.reply("Не удалось сохранить изменения. Проверь логи.");
      }
      ctx.session.adminEdit = undefined;
      return;
    }

    if (mode === "add_issue") {
      if (stage === "title") {
        if (!text)
          return ctx.reply("Название не может быть пустым. Попробуй ещё раз.");
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
  if (repairs[text]) {
    ctx.session = ctx.session || {};
    ctx.session.model = text;
    ctx.session.issues = Object.keys(repairs[text]);
    return ctx.reply(
      `📱 Модель: ${text}\nВыбери неисправность:`,
      issuesKeyboard(text, isAdminMode(ctx)),
    );
  }

  const step = ctx.session?.step;

  if (step === "name") {
    ctx.session.name = text;
    ctx.session.step = "phone";
    return ctx.reply(
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
    await ctx.reply(
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
        await bot.telegram.sendMessage(
          chatId,
          `🔔 Новая заявка\n\n` +
            `📄 ID: ${order.id}\n` +
            `👤 ${name}\n` +
            `📞 ${phone}\n` +
            `📱 ${model}\n` +
            `⚙️ ${issue}\n` +
            `💰 ${priceFmt}`,
        );
      } catch (e: any) {
        console.error(`Не удалось уведомить чат ${chatId}:`, e.message);
      }
    }

    ctx.session.step = undefined;
    return;
  }

  if (!step) {
    return ctx.reply(
      "Выбери модель из меню ниже или введи её текстом точно как в прайсе:",
      modelsKeyboard(0),
    );
  }

  return next();
});

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply("Нет доступа.");
  }
  if (!isPrivateChat(ctx)) {
    return ctx.reply("Админка доступна только в личном чате с ботом.");
  }
  const message = ctx.message;
  if (!("text" in message)) return;
  const [, ...rest] = (message.text || "").trim().split(/\s+/);
  const arg = rest.join(" ").toLowerCase();
  ctx.session = ctx.session || {};
  if (arg === "off" || arg === "exit" || arg === "stop") {
    const key = adminKey(ctx);
    if (key) adminModeSet.delete(key);
    ctx.session.adminEdit = undefined;
    return ctx.reply("Админ-режим выключен. Кнопки и команды скрыты.");
  }
  const key = adminKey(ctx);
  if (key) adminModeSet.add(key);
  await ctx.reply(
    `Админ-режим включён (ID: ${ctx.from.id}). Повтори выбор модели и неисправности, чтобы увидеть кнопки редактирования.`,
  );

  const { model, issue } = ctx.session;
  const repairs = repairsService.getRepairs();
  if (model && issue) {
    const payload = buildIssueResponse(model, issue, true);
    if (payload) {
      await ctx.reply(payload.text, payload.keyboard);
      return;
    }
  }
  if (model && repairs[model]) {
    await ctx.reply(
      `📱 Модель: ${model}\nВыбери неисправность:`,
      issuesKeyboard(model, true),
    );
    return;
  }
  await ctx.reply("Выбери модель:", modelsKeyboard(0));
});

bot.command("models", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  await ctx.reply("Выбери модель:", modelsKeyboard(0));
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
    await ctx.reply("✅ Этот чат теперь получает уведомления о новых заявках.");
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

process.on("unhandledRejection", (err) =>
  console.error("unhandledRejection:", err),
);
process.on("uncaughtException", (err) =>
  console.error("uncaughtException:", err),
);

async function main() {
  await repairsService.loadRepairs();
  await settingsService.loadNotifyChats(ADMIN_IDS);
  bot
    .launch()
    .then(() => {
      console.log(
        "🚀 Бот запущен! Админка и клиентский поток работают стабильно.",
      );
      if (ADMIN_IDS.length) console.log("👑 ADMIN_IDs =", ADMIN_IDS.join(", "));
    })
    .catch((e) => {
      console.error("❌ Ошибка запуска бота:", e);
    });
}

main();
