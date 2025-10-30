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

class RepairsService {
  private repairs: RepairsCache = {};
  private models: string[] = [];
  private isLoaded = false;

  async loadRepairs() {
    if (this.isLoaded) return;

    const { data, error } = await supabase.from("repairs").select("*");
    if (error) {
      console.error("❌ Error loading repairs:", error.message);
      return;
    }

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
    this.isLoaded = true;
    console.log(`✅ Loaded ${data.length} repairs from Supabase.`);
  }

  getRepairs(): Readonly<RepairsCache> {
    return this.repairs;
  }

  getModels(): Readonly<string[]> {
    return this.models;
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
    return true;
  }
}

export const repairsService = new RepairsService();
