import type { BotContext } from "../types/bot";

export const fmtPrice = (n: number | string | null | undefined) => {
  const num =
    typeof n === "string"
      ? Number(String(n).replace(/[^\d.]/g, ""))
      : Number(n);
  if (!Number.isFinite(num)) return `${n} ₽`;
  return `${num.toLocaleString("ru-RU")} ₽`;
};

export const descEnhancers = [
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

export const buildDescription = (issue: string, base = "") => {
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

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const normalizePhoneInput = (raw: string) => {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty" };
  if (digits.startsWith("8")) return { ok: false, reason: "startsWith8" };
  if (digits.length === 10) return { ok: true, value: `+7${digits}` };
  if (digits.length === 11 && digits.startsWith("7")) {
    return { ok: true, value: `+7${digits.slice(1)}` };
  }
  return { ok: false, reason: "length" };
};

export async function sendMessage(
  ctx: BotContext,
  text: string,
  extra?: Parameters<typeof ctx.reply>[1],
) {
  return ctx.reply(text, extra);
}

// Функции для работы с админами
export function createAdminUtils(ADMIN_IDS: string[]) {
  const adminModeSet = new Set<string>();

  const isAdmin = (ctx: BotContext) => {
    if (!ADMIN_IDS.length) return false;
    const id = ctx.from?.id;
    return id != null && ADMIN_IDS.includes(String(id));
  };

  const isPrivateChat = (ctx: BotContext) => ctx.chat?.type === "private";

  const adminKey = (ctx: BotContext) => {
    const id = ctx.from?.id;
    return id != null ? String(id) : null;
  };

  const isAdminMode = (ctx: BotContext) => {
    if (!isAdmin(ctx)) return false;
    const key = adminKey(ctx);
    return key ? adminModeSet.has(key) : false;
  };

  const setAdminMode = (ctx: BotContext, enabled: boolean) => {
    const key = adminKey(ctx);
    if (key) {
      if (enabled) {
        adminModeSet.add(key);
      } else {
        adminModeSet.delete(key);
      }
    }
  };

  return {
    isAdmin,
    isPrivateChat,
    isAdminMode,
    setAdminMode,
  };
}
