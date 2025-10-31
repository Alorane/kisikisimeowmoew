import { InlineKeyboard } from "grammy";
import { chunk } from "./bot";
import { repairsService } from "../services/repairs";

export function deviceTypesKeyboard(admin = false) {
  const deviceTypes = repairsService.getDeviceTypes(admin);
  const keyboard = new InlineKeyboard();
  const rows = chunk([...deviceTypes], 2);
  for (const row of rows) {
    for (const type of row) {
      keyboard.text(type, `type:${type}`);
    }
    keyboard.row();
  }
  if (admin) {
    keyboard.text("➕ Добавить тип", "add_device_type").row();
  }
  return keyboard;
}

export function modelsKeyboard(deviceType: string, page = 0, admin = false) {
  console.log(`⌨️ Creating keyboard for ${deviceType}, page ${page}`);
  const all = repairsService.getModelsForType(deviceType);
  const perPage = 12;
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = all.slice(p * perPage, p * perPage + perPage);

  const keyboard = new InlineKeyboard();
  const rows = chunk(slice, 2);
  console.log(`🔢 Created ${rows.length} rows for keyboard`);

  for (const row of rows) {
    for (const model of row) {
      keyboard.text(model, `mdl:${deviceType}:${model}`);
    }
    keyboard.row();
  }

  if (pages > 1) {
    keyboard
      .text("⏮️", `nav:${deviceType}:0`)
      .text("◀️", `nav:${deviceType}:${Math.max(0, p - 1)}`)
      .text(`${p + 1}/${pages}`, "noop")
      .text("▶️", `nav:${deviceType}:${Math.min(pages - 1, p + 1)}`)
      .text("⏭️", `nav:${deviceType}:${pages - 1}`)
      .row();
  }

  if (admin) {
    keyboard.text("➕ Добавить модель", `add_model:${deviceType}`).row();
  }
  keyboard.text("🔙 Назад", "back_types");

  return keyboard;
}

export function issuesKeyboard(model: string, admin = false) {
  const deviceRepairs = repairsService.getRepairsForModel(model);
  const entries = Object.keys(deviceRepairs || {});
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < entries.length; i++) {
    const issue = entries[i];
    keyboard.text(issue, `iss:${i}`).row();
  }

  if (admin) {
    keyboard.text("➕ Добавить работу", `add_issue:${model}`).row();
  }
  keyboard.text("🔙 Назад к моделям", "back_models");

  return keyboard;
}

export function orderKeyboard(admin = false) {
  const keyboard = new InlineKeyboard();
  if (admin) {
    keyboard
      .text("✏️ Цена", "admin_edit_price")
      .text("📝 Описание", "admin_edit_desc")
      .row()
      .text("🛡️ Гарантия", "admin_edit_waranty")
      .text("⏱️ Время", "admin_edit_work_time")
      .row();
    keyboard.text("🗑️ Удалить", "admin_delete_issue").row();
  }
  keyboard.text("📝 Оформить заявку", "order").row();
  keyboard.text("🔙 К неисправностям", "back_issues");

  return keyboard;
}
