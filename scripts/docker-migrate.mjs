#!/usr/bin/env node

/**
 * Docker migration runner for Drizzle ORM
 * Runs all pending migrations from the drizzle/ directory
 *
 * This is a standalone ESM script that can be executed in Docker
 * without needing the full TypeScript/tsx stack
 */

// Dynamic import handles ESM/CJS compatibility in standalone mode
const postgres = (await import("postgres")).default;
const { drizzle } = await import("drizzle-orm/postgres-js");
const { migrate } = await import("drizzle-orm/postgres-js/migrator");
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("✗ DATABASE_URL environment variable is not set");
  process.exit(1);
}

try {
  console.log("Connecting to database...");

  // Create PostgreSQL connection
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("Running migrations...");

  // Run migrations from drizzle/ directory
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../drizzle")
  });

  console.log("✓ Migrations completed successfully");

  await client.end();
  process.exit(0);
} catch (error) {
  console.error("✗ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
