import { supabase } from "../lib/supabase";
import { Repair, DeviceType, Device } from "../types/database";

export type RepairsCache = Record<
  number, // device_id
  Record<
    string, // repair title
    {
      price: number;
      description: string | null;
      warranty?: string | null;
      work_time?: string | null;
    }
  >
>;

let devicesCache: Device[] = [];

export const getDeviceById = (deviceId: number): Device | undefined => {
  return devicesCache.find((d) => d.id === deviceId);
};

export const getDeviceByName = (name: string): Device | undefined => {
  return devicesCache.find((d) => d.name === name);
};

class RepairsService {
  private repairs: RepairsCache = {};
  private models: string[] = [];
  private modelsGrouped: Record<string, string[]> = {};
  private deviceTypes: string[] = [];
  private deviceTypeRecords: DeviceType[] = [];
  private devices: Device[] = [];
  private isLoaded = false;

  async loadDeviceTypes() {
    console.log("🔄 Loading device types...");
    const { data, error } = await supabase
      .from("device_types")
      .select("*")
      .order("sort_order");

    if (error) {
      console.error("❌ Error loading device types:", error.message);
      return false;
    }

    if (data) {
      this.deviceTypeRecords = data as DeviceType[];
      console.log(
        `📂 Loaded ${data.length} device types:`,
        this.deviceTypeRecords.map((dt) => dt.name),
      );
    }
    return true;
  }

  async loadDevices() {
    console.log("🔄 Loading devices...");
    const { data, error } = await supabase
      .from("devices")
      .select(
        `
        *,
        device_types (
          name,
          sort_order
        )
      `,
      )
      .order("name");

    if (error) {
      console.error("❌ Error loading devices:", error.message);
      return false;
    }

    if (data) {
      this.devices = data as Device[];
      devicesCache = this.devices;
      console.log(`📱 Loaded ${data.length} devices`);
    }
    return true;
  }

  async loadRepairs() {
    console.log("🔄 Starting loadRepairs...");
    this.isLoaded = false;

    // First load device types
    const typesLoaded = await this.loadDeviceTypes();
    if (!typesLoaded) {
      console.error("❌ Failed to load device types");
      return;
    }

    // Load devices
    const devicesLoaded = await this.loadDevices();
    if (!devicesLoaded) {
      console.error("❌ Failed to load devices");
      return;
    }

    // Load repairs with device information
    const { data, error } = await supabase.from("repairs").select(`
        *,
        devices (
          id,
          name,
          device_type_id,
          device_types (
            name,
            sort_order
          )
        )
      `);

    if (error) {
      console.error("❌ Error loading repairs:", error.message);
      return;
    }

    console.log(`📊 Received ${data?.length || 0} repairs from database`);

    const repairsCache: RepairsCache = {};
    for (const repair of data as (Repair & {
      devices: Device & { device_types: DeviceType };
    })[]) {
      const deviceId = repair.device_id;
      if (!repairsCache[deviceId]) {
        repairsCache[deviceId] = {};
      }
      repairsCache[deviceId][repair.title] = {
        price: repair.price,
        description: repair.description,
        warranty: repair.warranty,
        work_time: repair.work_time,
      };
    }
    this.repairs = repairsCache;

    // Create models array from device names
    this.models = this.devices.map((d) => d.name).sort();

    console.log(`📱 Found models: ${this.models.join(", ")}`);

    const groups: Record<string, string[]> = {};
    for (const device of this.devices) {
      const deviceTypeName = device.device_types?.name || "Другое";
      console.log(`🏷️ Device ${device.name} -> type ${deviceTypeName}`);
      if (!groups[deviceTypeName]) groups[deviceTypeName] = [];
      groups[deviceTypeName].push(device.name);
    }
    this.modelsGrouped = groups;

    // Sort device types by sort_order from database
    this.deviceTypes = this.deviceTypeRecords
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((dt) => dt.name)
      .filter(
        (name) =>
          this.modelsGrouped[name] && this.modelsGrouped[name].length > 0,
      );

    // Add "Другое" at the end if it exists and has models
    if (
      this.modelsGrouped["Другое"] &&
      this.modelsGrouped["Другое"].length > 0
    ) {
      this.deviceTypes.push("Другое");
    }

    console.log(`📂 Device types: ${this.deviceTypes.join(", ")}`);
    console.log(`📂 Models grouped:`, this.modelsGrouped);

    this.isLoaded = true;
  }

  getRepairs(): Readonly<RepairsCache> {
    return this.repairs;
  }

  getDevices(): Readonly<Device[]> {
    return this.devices;
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

  getRepairsForDevice(deviceId: number):
    | Record<
        string,
        {
          price: number;
          description: string | null;
          warranty?: string | null;
          work_time?: string | null;
        }
      >
    | undefined {
    return this.repairs[deviceId];
  }

  getRepairsForModel(modelName: string):
    | Record<
        string,
        {
          price: number;
          description: string | null;
          warranty?: string | null;
          work_time?: string | null;
        }
      >
    | undefined {
    const device = getDeviceByName(modelName);
    if (!device) return undefined;
    return this.repairs[device.id];
  }

  async updatePrice(
    deviceId: number,
    issue: string,
    price: number,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ price })
      .match({ device_id: deviceId, title: issue });

    if (error) {
      console.error("❌ Error updating price:", error.message);
      return false;
    }

    if (this.repairs[deviceId]?.[issue]) {
      this.repairs[deviceId][issue].price = price;
    }
    return true;
  }

  async updateDescription(
    deviceId: number,
    issue: string,
    description: string,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ description })
      .match({ device_id: deviceId, title: issue });

    if (error) {
      console.error("❌ Error updating description:", error.message);
      return false;
    }

    if (this.repairs[deviceId]?.[issue]) {
      this.repairs[deviceId][issue].description = description;
    }
    return true;
  }

  async updateWarranty(
    deviceId: number,
    issue: string,
    warranty: string | null,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ warranty })
      .match({ device_id: deviceId, title: issue });

    if (error) {
      console.error("❌ Error updating warranty:", error.message);
      return false;
    }

    if (this.repairs[deviceId]?.[issue]) {
      this.repairs[deviceId][issue].warranty = warranty;
    }
    return true;
  }

  async updateWorkTime(
    deviceId: number,
    issue: string,
    work_time: string | null,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .update({ work_time })
      .match({ device_id: deviceId, title: issue });

    if (error) {
      console.error("❌ Error updating work_time:", error.message);
      return false;
    }

    if (this.repairs[deviceId]?.[issue]) {
      this.repairs[deviceId][issue].work_time = work_time;
    }
    return true;
  }

  async addRepair(
    deviceId: number,
    title: string,
    price: number,
    description?: string,
    warranty?: string | null,
    work_time?: string | null,
  ): Promise<boolean> {
    const payload = {
      device_id: deviceId,
      title,
      price,
      description: description || null,
      warranty: warranty ?? null,
      work_time: work_time ?? null,
    };

    const { error } = await supabase.from("repairs").insert(payload);

    if (error) {
      console.error("❌ Error adding repair:", error.message);
      return false;
    }

    // update cache
    if (!this.repairs[deviceId]) {
      this.repairs[deviceId] = {};
    }
    this.repairs[deviceId][title] = {
      price: payload.price,
      description: payload.description,
      warranty: payload.warranty,
      work_time: payload.work_time,
    };
    await this.loadRepairs(); // force reload to update groupings
    return true;
  }

  async deleteRepair(deviceId: number, issue: string): Promise<boolean> {
    const { error } = await supabase
      .from("repairs")
      .delete()
      .match({ device_id: deviceId, title: issue });

    if (error) {
      console.error("❌ Error deleting repair:", error.message);
      return false;
    }

    // update cache
    if (this.repairs[deviceId]) {
      delete this.repairs[deviceId][issue];
      if (Object.keys(this.repairs[deviceId]).length === 0) {
        delete this.repairs[deviceId];
      }
    }
    await this.loadRepairs(); // force reload to update groupings
    return true;
  }

  // Device Types CRUD operations
  getDeviceTypeRecords(): Readonly<DeviceType[]> {
    return this.deviceTypeRecords;
  }

  async addDeviceType(
    deviceType: Omit<DeviceType, "id" | "created_at" | "updated_at">,
  ): Promise<boolean> {
    const { error } = await supabase.from("device_types").insert(deviceType);

    if (error) {
      console.error("❌ Error adding device type:", error.message);
      return false;
    }

    await this.loadDeviceTypes();
    return true;
  }

  async updateDeviceType(
    id: number,
    updates: Partial<Pick<DeviceType, "name" | "sort_order">>,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("device_types")
      .update(updates)
      .match({ id });

    if (error) {
      console.error("❌ Error updating device type:", error.message);
      return false;
    }

    await this.loadDeviceTypes();
    await this.loadRepairs(); // reload groupings
    return true;
  }

  async deleteDeviceType(id: number): Promise<boolean> {
    const { error } = await supabase
      .from("device_types")
      .delete()
      .match({ id });

    if (error) {
      console.error("❌ Error deleting device type:", error.message);
      return false;
    }

    await this.loadDeviceTypes();
    await this.loadRepairs(); // reload groupings
    return true;
  }

  // Devices CRUD operations
  async addDevice(name: string, deviceTypeId: number): Promise<boolean> {
    const { error } = await supabase.from("devices").insert({
      name,
      device_type_id: deviceTypeId,
    });

    if (error) {
      console.error("❌ Error adding device:", error.message);
      return false;
    }

    await this.loadDevices(); // reload devices
    await this.loadRepairs(); // reload groupings
    return true;
  }

  async updateDevice(
    id: number,
    updates: Partial<Pick<Device, "name" | "device_type_id">>,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("devices")
      .update(updates)
      .match({ id });

    if (error) {
      console.error("❌ Error updating device:", error.message);
      return false;
    }

    await this.loadDevices(); // reload devices
    await this.loadRepairs(); // reload groupings
    return true;
  }

  async deleteDevice(id: number): Promise<boolean> {
    const { error } = await supabase.from("devices").delete().match({ id });

    if (error) {
      console.error("❌ Error deleting device:", error.message);
      return false;
    }

    await this.loadDevices(); // reload devices
    await this.loadRepairs(); // reload groupings
    return true;
  }
}

export const repairsService = new RepairsService();
