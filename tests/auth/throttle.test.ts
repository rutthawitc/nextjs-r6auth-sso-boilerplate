import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loginThrottle } from "@/db/schema";
import { check, clear, hit, purgeExpired, throttleKey } from "@/lib/auth/throttle";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw.delete(loginThrottle);
});

describe("throttle", () => {
  it("builds a lowercase key", () => {
    expect(throttleKey("AbC", "1.2.3.4")).toBe("abc|1.2.3.4");
  });

  it("locks after 5 hits with the remaining seconds", async () => {
    const k = "u|-";
    for (let i = 0; i < 4; i++) await hit(k, { db: ctx.db, now: at(i) });
    expect((await check(k, { db: ctx.db, now: at(4) })).locked).toBe(false);
    await hit(k, { db: ctx.db, now: at(4) });
    // window started at t=0 and ends at t=60
    expect(await check(k, { db: ctx.db, now: at(10) })).toEqual({ locked: true, retryAfterSeconds: 50 });
  });

  it("resets once the window has expired", async () => {
    const k = "u|-";
    for (let i = 0; i < 5; i++) await hit(k, { db: ctx.db, now: at(i) });
    expect((await check(k, { db: ctx.db, now: at(59) })).locked).toBe(true);
    expect((await check(k, { db: ctx.db, now: at(60) })).locked).toBe(false);
    expect(await hit(k, { db: ctx.db, now: at(61) })).toBe(1);
    const [row] = await ctx.raw.select().from(loginThrottle).where(eq(loginThrottle.key, k));
    expect(row.resetAt.getTime()).toBe(at(121).getTime());
  });

  it("does not extend the window on later hits", async () => {
    const k = "u|-";
    await hit(k, { db: ctx.db, now: at(0) });
    await hit(k, { db: ctx.db, now: at(30) });
    const [row] = await ctx.raw.select().from(loginThrottle).where(eq(loginThrottle.key, k));
    expect(row.resetAt.getTime()).toBe(at(60).getTime());
    expect(row.attempts).toBe(2);
  });

  it("honours custom window and max", async () => {
    const k = "u|-";
    await hit(k, { db: ctx.db, now: at(0), windowSeconds: 10 });
    await hit(k, { db: ctx.db, now: at(1), windowSeconds: 10 });
    expect((await check(k, { db: ctx.db, now: at(2), max: 2 })).locked).toBe(true);
    expect((await check(k, { db: ctx.db, now: at(10), max: 2 })).locked).toBe(false);
  });

  it("clear removes the key and expired rows", async () => {
    for (let i = 0; i < 5; i++) await hit("a|-", { db: ctx.db, now: at(i) });
    await hit("stale|-", { db: ctx.db, now: at(-1000) });
    await clear("a|-", { db: ctx.db, now: at(5) });
    expect((await check("a|-", { db: ctx.db, now: at(5) })).locked).toBe(false);
    expect(await ctx.raw.select().from(loginThrottle)).toHaveLength(0);
  });

  it("purgeExpired keeps live rows", async () => {
    await hit("live|-", { db: ctx.db, now: at(0) });
    await hit("old|-", { db: ctx.db, now: at(-1000) });
    await purgeExpired({ db: ctx.db, now: at(1) });
    const rows = await ctx.raw.select().from(loginThrottle);
    expect(rows.map((r) => r.key)).toEqual(["live|-"]);
  });

  it("counts concurrent hits atomically", async () => {
    const k = "c|-";
    await Promise.all(Array.from({ length: 10 }, () => hit(k, { db: ctx.db, now: at(1) })));
    const [row] = await ctx.raw.select().from(loginThrottle).where(eq(loginThrottle.key, k));
    expect(row.attempts).toBe(10);
  });
});
