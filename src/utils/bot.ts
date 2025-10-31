import type { BotContext } from "../types/bot";

export const fmtPrice = (n: number | string | null | undefined) => {
  const num =
    typeof n === "string"
      ? Number(String(n).replace(/[^\d.]/g, ""))
      : Number(n);
  if (!Number.isFinite(num)) return `${n} ₽`;
  return `${num.toLocaleString("ru-RU")} ₽`;
};

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const normalizePhoneInput = (raw: string) => {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty" };

  // Handle different Russian phone number formats
  if (digits.length === 10) {
    // 10 digits - add +7 prefix
    return { ok: true, value: `+7${digits}` };
  }

  if (digits.length === 11) {
    if (digits.startsWith("7")) {
      // 11 digits starting with 7 - add + prefix
      return { ok: true, value: `+${digits}` };
    }
    if (digits.startsWith("8")) {
      // 11 digits starting with 8 - replace 8 with +7
      return { ok: true, value: `+7${digits.slice(1)}` };
    }
  }

  return { ok: false, reason: "invalid_format" };
};

export async function sendMessage(
  ctx: BotContext,
  text: string,
  extra?: Parameters<typeof ctx.reply>[1],
) {
  return ctx.reply(text, extra);
}

// Функция для отправки сообщений с данными repair (сохраняет ID для обновлений)
export async function sendRepairMessage(
  ctx: BotContext,
  text: string,
  extra?: Parameters<typeof ctx.reply>[1],
) {
  const message = await ctx.reply(text, extra);
  ctx.session.repairMessageId = message.message_id;
  return message;
}

// Функция для замены сообщения с данными repair (удаляет старое и отправляет новое)
export async function replaceRepairMessage(
  ctx: BotContext,
  text: string,
  extra?: Parameters<typeof ctx.reply>[1],
) {
  const messageId = ctx.session.repairMessageId;
  if (messageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, messageId);
    } catch {
      // Игнорируем ошибку удаления
    }
  }

  // Отправляем новое сообщение
  await sendRepairMessage(ctx, text, extra);
}

// Функция для отправки сообщений с клавиатурой (удаляет предыдущее сообщение с клавиатурой)
export async function sendKeyboardMessage(
  ctx: BotContext,
  text: string,
  extra?: Parameters<typeof ctx.reply>[1],
) {
  const keyboardMessageId = ctx.session.keyboardMessageId;
  console.log(
    `🔄 sendKeyboardMessage: current keyboardMessageId=${keyboardMessageId}, chat=${ctx.chat?.id}`,
  );

  if (keyboardMessageId) {
    try {
      console.log(
        `🗑️ Deleting previous keyboard message: ${keyboardMessageId}`,
      );
      await ctx.api.deleteMessage(ctx.chat!.id, keyboardMessageId);
      console.log(
        `✅ Successfully deleted keyboard message: ${keyboardMessageId}`,
      );
    } catch (error) {
      console.warn(
        `❌ Failed to delete keyboard message ${keyboardMessageId}:`,
        error,
      );
    }
  }

  // Отправляем новое сообщение и сохраняем его ID
  console.log(`📤 Sending new keyboard message`);
  const message = await ctx.reply(text, extra);
  ctx.session.keyboardMessageId = message.message_id;
  console.log(`💾 Saved new keyboardMessageId: ${message.message_id}`);
  return message;
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
