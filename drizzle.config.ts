import { config } from "dotenv";
import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

config({ path: resolve(process.cwd(), ".env.local"), override: false });
config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
