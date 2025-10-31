import "dotenv/config";
import * as fs from "fs";
import * as readline from "readline";
import * as xlsx from "xlsx";
import { supabase } from "../lib/supabase";
import { Repair } from "../types/database";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Helper to normalize ugly header keys like '="Наименование"'
function normalizeKey(key: string): string {
  return key.replace(/="|"|"/g, "").trim();
}

async function main() {
  try {
    const deviceName = await askQuestion(
      "Enter the device name (e.g., 'iPhone 14'): ",
    );
    if (!deviceName.trim()) {
      console.error("❌ Device name is required.");
      return;
    }

    const deviceTypeName = await askQuestion(
      "Enter the device type (iPhone/iPad/MacBook/Apple Watch/Другое): ",
    );
    if (!deviceTypeName.trim()) {
      console.error("❌ Device type is required.");
      return;
    }

    const xlsFilePath = await askQuestion(
      "Enter the full path to the XLS file: ",
    );
    if (!fs.existsSync(xlsFilePath)) {
      console.error(`❌ File not found at path: ${xlsFilePath}`);
      return;
    }

    console.log(
      `\n⏳ Parsing XLS file and preparing data for '${deviceName}'...`,
    );

    // First, ensure device type exists
    let { data: deviceType } = await supabase
      .from("device_types")
      .select("id")
      .eq("name", deviceTypeName)
      .single();

    if (!deviceType) {
      console.log(`📝 Creating device type '${deviceTypeName}'...`);
      const { data: newDeviceType, error: deviceTypeError } = await supabase
        .from("device_types")
        .insert({ name: deviceTypeName, sort_order: 99 })
        .select("id")
        .single();

      if (deviceTypeError) {
        console.error(
          "❌ Error creating device type:",
          deviceTypeError.message,
        );
        return;
      }
      deviceType = newDeviceType;
    }

    // Find or create device
    let { data: device } = await supabase
      .from("devices")
      .select("id")
      .eq("name", deviceName)
      .single();

    if (!device) {
      console.log(`📱 Creating device '${deviceName}'...`);
      const { data: newDevice, error: deviceError } = await supabase
        .from("devices")
        .insert({ name: deviceName, device_type_id: deviceType.id })
        .select("id")
        .single();

      if (deviceError) {
        console.error("❌ Error creating device:", deviceError.message);
        return;
      }
      device = newDevice;
    }

    const workbook = xlsx.readFile(xlsFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData =
      xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    const repairsToInsert: Omit<Repair, "id" | "created_at" | "updated_at">[] =
      jsonData
        .map((row) => {
          const normalizedRow = Object.entries(row).reduce(
            (acc, [key, value]) => {
              acc[normalizeKey(key)] = value;
              return acc;
            },
            {} as Record<string, unknown>,
          );

          const price = parseFloat(normalizedRow["Стандартная цена"] as string);
          const title = normalizedRow["Наименование"];

          if (!title || isNaN(price)) {
            console.warn(
              `⚠️ Skipping row due to missing title or invalid price: ${JSON.stringify(
                row,
              )}`,
            );
            return null;
          }

          return {
            device_id: device.id,
            title: String(title),
            price: price,
            description: normalizedRow["Описание"]
              ? String(normalizedRow["Описание"])
              : null,
            warranty: normalizedRow["Гарантия"]
              ? String(normalizedRow["Гарантия"])
              : null,
            work_time: normalizedRow["Длительность (минуты)"]
              ? String(normalizedRow["Длительность (минуты)"])
              : null,
          };
        })
        .filter(
          (item): item is Omit<Repair, "id" | "created_at" | "updated_at"> =>
            item !== null,
        );

    if (repairsToInsert.length === 0) {
      console.error("❌ No valid repair data found in the file to import.");
      return;
    }

    console.log(`✅ Found ${repairsToInsert.length} valid records.`);
    console.log(`⏳ Deleting existing repairs for '${deviceName}'...`);

    const { error: deleteError } = await supabase
      .from("repairs")
      .delete()
      .eq("device_id", device.id);

    if (deleteError) {
      console.error(
        `❌ Error deleting old repairs for ${deviceName}:`,
        deleteError.message,
      );
      return;
    }

    console.log(`✅ Old repairs deleted.`);
    console.log(`⏳ Inserting new repairs for '${deviceName}'...`);

    const { error: insertError } = await supabase
      .from("repairs")
      .insert(repairsToInsert);

    if (insertError) {
      console.error(
        `❌ Error inserting new repairs for ${deviceName}:`,
        insertError.message,
      );
      return;
    }

    console.log(
      `\n🎉 Successfully imported ${repairsToInsert.length} repairs for '${deviceName}'!`,
    );
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  } finally {
    rl.close();
  }
}

main();
