import "dotenv/config";
import postgres from "postgres";

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: "require",
  connection: {
    options: `project=your-project-name`,
  },
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

  console.log("Tables created successfully.");
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
    },
    {
      device: "iPhone 6",
      title: "Замена аккумулятора",
      price: 2500,
      desc: "Оригинальный аккумулятор.",
    },
  ];

  for (const repair of repairsData) {
    await sql`
      INSERT INTO repairs (device, title, price, desc)
      VALUES (${repair.device}, ${repair.title}, ${repair.price}, ${repair.desc})
      ON CONFLICT (device, title) DO NOTHING;
    `;
  }

  console.log("Repairs data seeded.");
}

async function main() {
  try {
    await createTables();
    await seedRepairs();
    console.log("Database seeding completed.");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await sql.end();
  }
}

main();
