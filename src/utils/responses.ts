import { repairsService, getDeviceById } from "../services/repairs";
import { fmtPrice } from "./bot";
import { orderKeyboard } from "./keyboards";

export function buildIssueResponse(
  deviceId: number,
  issue: string,
  admin = false,
) {
  const repairs = repairsService.getRepairs();
  const item = repairs[deviceId]?.[issue];
  if (!item) return null;

  const device = getDeviceById(deviceId);
  const model = device?.name || `Device #${deviceId}`;

  const price = fmtPrice(item.price);
  const warranty = item.warranty ?? null;
  const workTime = item.work_time ?? null;
  const lines = [
    `📱 Модель: ${model}`,
    `⚙️ Услуга: ${issue}`,
    `💰 Цена: ${price}`,
    `🛡️ Гарантия: ${(warranty && warranty.trim()) || "—"}`,
    `⏱️ Время: ${(workTime && workTime.trim()) || "—"}`,
    `ℹ️ ${item.description || "Описание не указано"}`,
  ];
  const text = lines.join("\n\n");
  return { text, keyboard: orderKeyboard(admin) };
}
