/**
 * Liveness/readiness check for the container healthcheck. Only the database is
 * checked: an r6auth outage must not restart the app, because the local admin
 * break-glass login has to keep working while r6auth is down.
 */
import { sql } from "drizzle-orm";

import type { AppDb } from "@/lib/users/sync";

export const HEALTH_DB_TIMEOUT_MS = 2000;

export type HealthResult = { ok: true } | { ok: false; reason: "db_error" | "db_timeout" };

export async function checkHealth(db: AppDb, timeoutMs: number = HEALTH_DB_TIMEOUT_MS): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<HealthResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "db_timeout" }), timeoutMs);
  });
  const query = db.execute(sql`select 1`).then(
    (): HealthResult => ({ ok: true }),
    (): HealthResult => ({ ok: false, reason: "db_error" }),
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
