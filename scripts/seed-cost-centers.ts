/**
 * Upserts cost center reference data (code, BA, name) from a CSV with the
 * header `cctr,ba,cctrname`. Re-runnable; never deletes rows.
 *
 *   pnpm seed-cost-centers [--file data/cost-centers.csv]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { upsertCostCenters } from "../src/lib/cost-centers/admin";
import { parseCostCenterCsv } from "../src/lib/cost-centers/csv";
import type { AppDb } from "../src/lib/users/sync";
import { bold, green, loadEnvFiles, parseArgs, red } from "./lib/cli";

async function main() {
  loadEnvFiles();
  const { options } = parseArgs(process.argv.slice(2), ["file"]);
  const file = resolve(process.cwd(), options.file || "data/cost-centers.csv");

  const { rows, errors } = parseCostCenterCsv(readFileSync(file, "utf8"));
  if (errors.length > 0) {
    for (const e of errors) console.error(red(`✗ ${e}`));
    console.error(red(`${errors.length} invalid line(s) in ${file}; nothing was written.`));
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(red("DATABASE_URL is not set (.env.local, .env or the environment)."));
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema }) as unknown as AppDb;
    const count = await upsertCostCenters(rows, db);
    console.log(green(`✓ ${bold(String(count))} cost centers upserted from ${file}`));
  } finally {
    await client.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(red(`✗ ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
