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
    if (!deviceName) {
      console.error("❌ Device name is required.");
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

    const workbook = xlsx.readFile(xlsFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData =
      xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    const repairsToInsert: Omit<Repair, "id">[] = jsonData
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
          device: deviceName,
          title: String(title),
          price: price,
          desc: String(normalizedRow["Описание"] ?? ""),
          waranty: normalizedRow["Гарантия"]
            ? String(normalizedRow["Гарантия"])
            : null,
          work_time: normalizedRow["Длительность (минуты)"]
            ? String(normalizedRow["Длительность (минуты)"])
            : null,
        };
      })
      .filter((item): item is Omit<Repair, "id"> => item !== null);

    if (repairsToInsert.length === 0) {
      console.error("❌ No valid repair data found in the file to import.");
      return;
    }

    console.log(`✅ Found ${repairsToInsert.length} valid records.`);
    console.log(`⏳ Deleting existing repairs for '${deviceName}'...`);

    const { error: deleteError } = await supabase
      .from("repairs")
      .delete()
      .match({ device: deviceName });

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
