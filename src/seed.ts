import "dotenv/config";
import postgres from "postgres";

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const projectRef =
  process.env.PGPROJECT ||
  process.env.SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_REF;

const connectionOptions =
  process.env.PGOPTIONS || (projectRef ? `project=${projectRef}` : undefined);

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: Number(process.env.PGPORT || 5432),
  ssl: "require",
  ...(connectionOptions ? { connection: { options: connectionOptions } } : {}),
});

async function createTables() {
  console.log("Creating tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS repairs (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      device TEXT NOT NULL,
      title TEXT NOT NULL,
      price NUMERIC NOT NULL,
      desc TEXT,
      waranty TEXT,
      work_time TEXT,
      UNIQUE(device, title)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      ts TIMESTAMPTZ DEFAULT NOW(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      model TEXT NOT NULL,
      issue TEXT NOT NULL,
      price NUMERIC NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_chats (
      chat_id TEXT PRIMARY KEY
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS device_types (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name TEXT NOT NULL UNIQUE,
      pattern TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Add index for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_device_types_sort_order ON device_types(sort_order);
  `;

  console.log("Tables created successfully.");
}

async function seedDeviceTypes() {
  console.log("Seeding device types data...");

  const deviceTypesData = [
    { name: "iPhone", pattern: "iphone", sort_order: 1 },
    { name: "iPad", pattern: "ipad", sort_order: 2 },
    { name: "Apple Watch", pattern: "watch", sort_order: 3 },
    { name: "MacBook", pattern: "macbook", sort_order: 4 },
    { name: "Другое", pattern: ".*", sort_order: 999 },
  ];

  for (const deviceType of deviceTypesData) {
    await sql`
      INSERT INTO device_types (name, pattern, sort_order)
      VALUES (
        ${deviceType.name},
        ${deviceType.pattern},
        ${deviceType.sort_order}
      )
      ON CONFLICT (name) DO NOTHING;
    `;
  }

  console.log("Device types data seeded.");
}

async function seedRepairs() {
  console.log("Seeding repairs data...");

  // Using repairsService to get data from repairs-example.json logic
  // In a real scenario, you might read a file or have a predefined list here.
  // For now, let's assume we have a function to get this data.
  // This is a placeholder for your actual seeding data.
  const repairsData = [
    {
      device: "iPhone 5s",
      title: "Замена экрана (копия)",
      price: 5000,
      desc: "Устанавливается копия дисплея, гарантия 3 месяца.",
      waranty: "3 месяца",
      work_time: "от 2 часов",
    },
    {
      device: "iPhone 6",
      title: "Замена аккумулятора",
      price: 2500,
      desc: "Оригинальный аккумулятор.",
      waranty: "6 месяцев",
      work_time: "1 час",
    },
  ];

  for (const repair of repairsData) {
    await sql`
      INSERT INTO repairs (device, title, price, desc, waranty, work_time)
      VALUES (
        ${repair.device},
        ${repair.title},
        ${repair.price},
        ${repair.desc},
        ${repair.waranty},
        ${repair.work_time}
      )
      ON CONFLICT (device, title) DO NOTHING;
    `;
  }

  console.log("Repairs data seeded.");
}

async function main() {
  try {
    await createTables();
    await seedDeviceTypes();
    await seedRepairs();
    console.log("Database seeding completed.");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await sql.end();
  }
}

main();
