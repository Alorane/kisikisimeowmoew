import { repairsService } from "../services/repairs";
import { fmtPrice, buildDescription } from "./bot";
import { orderKeyboard } from "./keyboards";

export function buildIssueResponse(
  model: string,
  issue: string,
  admin = false,
) {
  const repairs = repairsService.getRepairs();
  const item = repairs[model]?.[issue];
  if (!item) return null;
  const price = fmtPrice(item.price);
  const desc = buildDescription(issue, item.desc);
  const waranty = item.waranty ?? null;
  const workTime = item.work_time ?? null;
  const lines = [
    `📱 ${model}`,
    `⚙️ ${issue}`,
    `💰 ${price}`,
    `🛡️ Гарантия: ${(waranty && waranty.trim()) || "—"}`,
    `⏱️ Время: ${(workTime && workTime.trim()) || "—"}`,
    `ℹ️ ${desc}`,
  ];
  const text = lines.join("\n");
  return { text, keyboard: orderKeyboard(admin) };
}
