import { supabase } from "../lib/supabase";
import { Repair } from "../types/database";

export type RepairsCache = Record<
  string,
  Record<
    string,
    {
      price: number;
      desc: string;
      waranty?: string | null;
      work_time?: string | null;
    }
  >
>;

const deviceTypePatterns = [
  { type: "iPhone", pattern: /iphone/i },
  { type: "iPad", pattern: /ipad/i },
  { type: "Apple Watch", pattern: /watch/i },
  { type: "MacBook", pattern: /macbook/i },
];

export const getDeviceType = (model: string) => {
  for (const { type, pattern } of deviceTypePatterns) {
    if (pattern.test(model)) return type;
  }
  return "Другое";
};

class RepairsService {
  private repairs: RepairsCache = {};
  private models: string[] = [];
  private modelsGrouped: Record<string, string[]> = {};
  private deviceTypes: string[] = [];
  private isLoaded = false;

  async loadRepairs() {
    console.log("🔄 Starting loadRepairs...");
    this.isLoaded = false;

    const { data, error } = await supabase.from("repairs").select("*");
    if (error) {
      console.error("❌ Error loading repairs:", error.message);
      return;
    }

    console.log(`📊 Received ${data?.length || 0} repairs from database`);

    const repairsCache: RepairsCache = {};
    for (const repair of data as Repair[]) {
      if (!repairsCache[repair.device]) {
        repairsCache[repair.device] = {};
      }
      repairsCache[repair.device][repair.title] = {
        price: repair.price,
        desc: repair.desc,
        waranty: repair.waranty,
        work_time: repair.work_time,
      };
    }
    this.repairs = repairsCache;
    this.models = Object.keys(this.repairs).sort();

    console.log(`📱 Found models: ${this.models.join(", ")}`);

    const groups: Record<string, string[]> = {};
    for (const model of this.models) {
      const type = getDeviceType(model);
      console.log(`🏷️ Model ${model} -> type ${type}`);
      if (!groups[type]) groups[type] = [];
      groups[type].push(model);
    }
    this.modelsGrouped = groups;
    this.deviceTypes = Object.keys(this.modelsGrouped).sort((a, b) => {
      if (a === "Другое") return 1;
      if (b === "Другое") return -1;
      return a.localeCompare(b);
    });

    console.log(`📂 Device types: ${this.deviceTypes.join(", ")}`);
    console.log(`📂 Models grouped:`, this.modelsGrouped);

    this.isLoaded = true;
  }

  getRepairs(): Readonly<RepairsCache> {
    return this.repairs;
  }

  getModels(): Readonly<string[]> {
    return this.models;
  }

  getDeviceTypes(): Readonly<string[]> {
    return this.deviceTypes;
  }

  getModelsForType(type: string): Readonly<string[]> {
    const models = this.modelsGrouped[type] || [];
    console.log(
      `🔍 getModelsForType(${type}) -> ${models.length} models: ${models.join(", ")}`,
    );
    return models;
  }

  async updatePrice(
    model: string,
    issue: string,
    price: number,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ price })
      .match({ device: model, title: issue });

    if (error) {
      console.error("❌ Error updating price:", error.message);
      return false;
    }

    if (this.repairs[model]?.[issue]) {
      this.repairs[model][issue].price = price;
    }
    return true;
  }

  async updateDescription(
    model: string,
    issue: string,
    desc: string,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ desc })
      .match({ device: model, title: issue });

    if (error) {
      console.error("❌ Error updating description:", error.message);
      return false;
    }

    if (this.repairs[model]?.[issue]) {
      this.repairs[model][issue].desc = desc;
    }
    return true;
  }

  async updateWaranty(
    model: string,
    issue: string,
    waranty: string | null,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ waranty })
      .match({ device: model, title: issue });

    if (error) {
      console.error("❌ Error updating waranty:", error.message);
      return false;
    }

    if (this.repairs[model]?.[issue]) {
      this.repairs[model][issue].waranty = waranty;
    }
    return true;
  }

  async updateWorkTime(
    model: string,
    issue: string,
    work_time: string | null,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ work_time })
      .match({ device: model, title: issue });

    if (error) {
      console.error("❌ Error updating work_time:", error.message);
      return false;
    }

    if (this.repairs[model]?.[issue]) {
      this.repairs[model][issue].work_time = work_time;
    }
    return true;
  }

  async addRepair(
    repair: Pick<Repair, "device" | "title" | "price" | "desc"> &
      Partial<Pick<Repair, "waranty" | "work_time">>,
  ): Promise<boolean> {
    const payload = {
      device: repair.device,
      title: repair.title,
      price: repair.price,
      desc: repair.desc,
      waranty: repair.waranty ?? null,
      work_time: repair.work_time ?? null,
    };

    const { error } = await supabase.from("repairs").insert(payload);

    if (error) {
      console.error("❌ Error adding repair:", error.message);
      return false;
    }

    // update cache
    if (!this.repairs[payload.device]) {
      this.repairs[payload.device] = {};
    }
    this.repairs[payload.device][payload.title] = {
      price: payload.price,
      desc: payload.desc,
      waranty: payload.waranty,
      work_time: payload.work_time,
    };
    if (!this.models.includes(payload.device)) {
      this.models.push(payload.device);
      this.models.sort();
    }
    await this.loadRepairs(); // force reload to update groupings
    return true;
  }

  async deleteRepair(model: string, issue: string): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .delete()
      .match({ device: model, title: issue });

    if (error) {
      console.error("❌ Error deleting repair:", error.message);
      return false;
    }

    // update cache
    if (this.repairs[model]) {
      delete this.repairs[model][issue];
      if (Object.keys(this.repairs[model]).length === 0) {
        delete this.repairs[model];
        this.models = this.models.filter((m) => m !== model);
      }
    }
    await this.loadRepairs(); // force reload to update groupings
    return true;
  }
}

export const repairsService = new RepairsService();
