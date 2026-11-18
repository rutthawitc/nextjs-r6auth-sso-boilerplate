import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL environment variable");
}

declare global {
  var drizzleDb: PostgresJsDatabase<typeof schema> | undefined;
  var drizzleSqlClient: ReturnType<typeof postgres> | undefined;
}

const queryClient =
  global.drizzleSqlClient ??
  postgres(connectionString, {
    max: 1,
    prepare: false,
  });

const db = global.drizzleDb ?? drizzle(queryClient, { schema });

if (process.env.NODE_ENV !== "production") {
  global.drizzleSqlClient = queryClient;
  global.drizzleDb = db;
}

export { db, schema, queryClient };
