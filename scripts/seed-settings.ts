import { drizzle } from "drizzle-orm/postgres-js";
import dotenv from "dotenv";
import path from "node:path";
import postgres from "postgres";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

async function seedSettings() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding system settings...");
  await db
    .insert(systemSettings)
    .values({ key: "registration_mode", value: "allow_new_users" })
    .onConflictDoNothing();

  console.log("✓ system_settings seeded: registration_mode = allow_new_users");
  await client.end();
  process.exit(0);
}

seedSettings().catch((e) => { console.error(e); process.exit(1); });
