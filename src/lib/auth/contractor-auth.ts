import { and, eq } from "drizzle-orm";

import { users, type SelectUser } from "@/db/schema";
import type { AppDb } from "@/lib/users/sync";

async function resolveDb(db?: AppDb): Promise<AppDb> {
  return db ?? ((await import("@/lib/db")).db as unknown as AppDb);
}

/** Finds a contractor account by its (normalized) code. Throws on DB errors. */
export async function findContractor(normalizedUsername: string, db?: AppDb): Promise<SelectUser | null> {
  const conn = await resolveDb(db);
  const [row] = await conn
    .select()
    .from(users)
    .where(and(eq(users.username, normalizedUsername.toLowerCase()), eq(users.accountType, "contractor")))
    .limit(1);
  return row ?? null;
}

export async function updateContractorLastLogin(id: string, now: Date, db?: AppDb): Promise<void> {
  const conn = await resolveDb(db);
  await conn.update(users).set({ lastLogin: now, updatedAt: now }).where(eq(users.id, id));
}
