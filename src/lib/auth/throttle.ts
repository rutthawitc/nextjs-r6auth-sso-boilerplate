/**
 * Postgres-backed login throttle (fixed window), equivalent to Laravel's
 * RateLimiter::hit($key, 60) with a maximum of 5 attempts.
 */
import { eq, like, lt, sql } from "drizzle-orm";

import { loginThrottle } from "@/db/schema";
import type { AppDb } from "@/lib/users/sync";

export const THROTTLE_WINDOW_SECONDS = 60;
export const THROTTLE_MAX_ATTEMPTS = 5;

export interface ThrottleOptions {
  db?: AppDb;
  now?: Date;
  windowSeconds?: number;
  max?: number;
}

export interface ThrottleStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

async function resolveDb(db?: AppDb): Promise<AppDb> {
  return db ?? ((await import("@/lib/db")).db as unknown as AppDb);
}

/** Throttle key: lowercased normalized username plus client address. */
export function throttleKey(normalizedUsername: string, ip: string): string {
  return `${normalizedUsername.toLowerCase()}|${ip}`;
}

export async function check(key: string, options: ThrottleOptions = {}): Promise<ThrottleStatus> {
  const db = await resolveDb(options.db);
  const now = options.now ?? new Date();
  const max = options.max ?? THROTTLE_MAX_ATTEMPTS;

  const [row] = await db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).limit(1);
  if (!row || row.resetAt.getTime() <= now.getTime() || row.attempts < max) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
  };
}

/**
 * Record a failed attempt. A single atomic upsert: when the stored window has
 * expired the counter restarts at 1 with a fresh `reset_at`, otherwise it is
 * incremented (the window start is not extended). Returns the new attempt count.
 */
export async function hit(key: string, options: ThrottleOptions = {}): Promise<number> {
  const db = await resolveDb(options.db);
  const now = options.now ?? new Date();
  const windowSeconds = options.windowSeconds ?? THROTTLE_WINDOW_SECONDS;

  const nowTs = sql`${now.toISOString()}::timestamptz`;
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const resetTs = sql`${resetAt.toISOString()}::timestamptz`;

  const [row] = await db
    .insert(loginThrottle)
    .values({ key, attempts: 1, resetAt, updatedAt: now })
    .onConflictDoUpdate({
      target: loginThrottle.key,
      set: {
        attempts: sql`CASE WHEN ${loginThrottle.resetAt} <= ${nowTs} THEN 1 ELSE ${loginThrottle.attempts} + 1 END`,
        resetAt: sql`CASE WHEN ${loginThrottle.resetAt} <= ${nowTs} THEN ${resetTs} ELSE ${loginThrottle.resetAt} END`,
        updatedAt: now,
      },
    })
    .returning({ attempts: loginThrottle.attempts });

  // Opportunistic housekeeping on roughly 1 in 100 hits.
  if (Math.random() < 0.01) await purgeExpired(options).catch(() => {});

  return row?.attempts ?? 1;
}

/** Forget a key (successful login). Also drops expired rows of other keys. */
export async function clear(key: string, options: ThrottleOptions = {}): Promise<void> {
  const db = await resolveDb(options.db);
  await db.delete(loginThrottle).where(eq(loginThrottle.key, key));
  await purgeExpired(options);
}

/**
 * Forget every key of one username (all client addresses), e.g. after an admin
 * resets a password. `%`, `_` and `\` in the username are matched literally.
 */
export async function clearForUsername(username: string, options: ThrottleOptions = {}): Promise<void> {
  const db = await resolveDb(options.db);
  const escaped = username.toLowerCase().replace(/[\\%_]/g, "\\$&");
  await db.delete(loginThrottle).where(like(loginThrottle.key, `${escaped}|%`));
}

export async function purgeExpired(options: ThrottleOptions = {}): Promise<void> {
  const db = await resolveDb(options.db);
  const now = options.now ?? new Date();
  await db.delete(loginThrottle).where(lt(loginThrottle.resetAt, now));
}
