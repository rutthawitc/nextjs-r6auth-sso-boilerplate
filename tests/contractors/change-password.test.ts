import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loginThrottle, users } from "@/db/schema";
import { check, hit, throttleKey, clearForUsername } from "@/lib/auth/throttle";
import { changeContractorPassword } from "@/lib/contractors/change-password";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let hash: string;
const NOW = new Date("2026-06-15T05:00:00Z");
const IP = "1.1.1.1";

beforeAll(async () => {
  ctx = await createTestDb();
  hash = await bcrypt.hash("Temp1234!", 4);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw.delete(loginThrottle);
  await ctx.raw.delete(users);
});

const seed = async (over: Partial<typeof users.$inferInsert> = {}) => {
  const [row] = await ctx.raw
    .insert(users)
    .values({
      username: "90001",
      displayName: "สมชาย ใจดี",
      firstName: "สมชาย",
      accountType: "contractor",
      passwordHash: hash,
      contractStart: "2026-01-01",
      contractEnd: "2026-12-31",
      mustChangePassword: true,
      ...over,
    })
    .returning();
  return row;
};

const run = (userId: string, currentPassword: string, newPassword: string) =>
  changeContractorPassword({ userId, currentPassword, newPassword, ip: IP }, { db: ctx.db, now: () => NOW });

const rowOf = async (id: string) => (await ctx.raw.select().from(users).where(eq(users.id, id)))[0];

describe("changeContractorPassword", () => {
  it("replaces the hash, clears the flag and returns a fresh session user", async () => {
    const u = await seed();
    const r = await run(u.id, "Temp1234!", "BrandNew-9876");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user).toEqual({
      kind: "contractor",
      id: u.id,
      username: "90001",
      role: "user",
      displayName: "สมชาย ใจดี",
      firstName: "สมชาย",
      mustChangePassword: false,
    });
    const row = await rowOf(u.id);
    expect(row.passwordHash).not.toBe(hash);
    expect(await bcrypt.compare("BrandNew-9876", row.passwordHash!)).toBe(true);
    expect(row.mustChangePassword).toBe(false);
    expect(row.passwordChangedAt?.getTime()).toBe(NOW.getTime());
  });

  it("clears the throttle on success", async () => {
    const u = await seed();
    await run(u.id, "wrong-pass", "BrandNew-9876");
    await run(u.id, "Temp1234!", "BrandNew-9876");
    expect((await check(throttleKey("90001", IP), { db: ctx.db, now: NOW })).locked).toBe(false);
    expect(await ctx.raw.select().from(loginThrottle)).toHaveLength(0);
  });

  it("wrong current password -> INVALID_CURRENT and a throttle hit, hash unchanged", async () => {
    const u = await seed();
    expect(await run(u.id, "nope-nope", "BrandNew-9876")).toEqual({ ok: false, code: "INVALID_CURRENT" });
    const [t] = await ctx.raw.select().from(loginThrottle);
    expect(t.key).toBe("90001|1.1.1.1");
    expect(t.attempts).toBe(1);
    expect((await rowOf(u.id)).passwordHash).toBe(hash);
  });

  it("5 wrong attempts lock the account, even for the right password", async () => {
    const u = await seed();
    for (let i = 0; i < 5; i++) await run(u.id, "nope-nope", "BrandNew-9876");
    const r = await run(u.id, "Temp1234!", "BrandNew-9876");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("TOO_MANY_ATTEMPTS");
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect((await rowOf(u.id)).passwordHash).toBe(hash);
  });

  it("new = current -> SAME_PASSWORD, no throttle hit", async () => {
    const u = await seed();
    expect(await run(u.id, "Temp1234!", "Temp1234!")).toEqual({
      ok: false,
      code: "SAME_PASSWORD",
      problem: "same_as_current",
    });
    expect(await ctx.raw.select().from(loginThrottle)).toHaveLength(0);
  });

  it("weak new password -> WEAK_PASSWORD with the problem", async () => {
    const u = await seed();
    expect(await run(u.id, "Temp1234!", "short")).toEqual({
      ok: false,
      code: "WEAK_PASSWORD",
      problem: "too_short",
    });
    const long = await run(u.id, "Temp1234!", "ก".repeat(30));
    expect(long).toEqual({ ok: false, code: "WEAK_PASSWORD", problem: "too_long" });
    expect((await rowOf(u.id)).passwordHash).toBe(hash);
  });

  it("contract ended, not started or inactive -> NOT_ALLOWED", async () => {
    const ended = await seed({ contractEnd: "2026-06-14" });
    expect(await run(ended.id, "Temp1234!", "BrandNew-9876")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    await ctx.raw.delete(users);
    const future = await seed({ contractStart: "2026-06-16" });
    expect(await run(future.id, "Temp1234!", "BrandNew-9876")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    await ctx.raw.delete(users);
    const off = await seed({ isActive: false });
    expect(await run(off.id, "Temp1234!", "BrandNew-9876")).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });

  it("an SSO row or unknown id -> NOT_ALLOWED", async () => {
    const [ad] = await ctx.raw
      .insert(users)
      .values({ username: "10001", displayName: "สมชาย ใจดี", accountType: "sso" })
      .returning();
    expect(await run(ad.id, "x", "BrandNew-9876")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await run("00000000-0000-0000-0000-000000000000", "x", "BrandNew-9876")).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
    });
  });

  it("a DB failure -> SERVICE_UNAVAILABLE", async () => {
    const broken = { select: () => { throw new Error("boom"); } } as never;
    const r = await changeContractorPassword(
      { userId: "x", currentPassword: "a", newPassword: "BrandNew-9876", ip: IP },
      { db: broken, now: () => NOW },
    );
    expect(r).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
  });
});

describe("clearForUsername", () => {
  it("removes every ip for the username but not look-alikes", async () => {
    for (const k of ["90001|1.1.1.1", "90001|2.2.2.2", "900011|1.1.1.1", "9000_|1.1.1.1"]) {
      await hit(k, { db: ctx.db, now: NOW });
    }
    await clearForUsername("90001", { db: ctx.db, now: NOW });
    const keys = (await ctx.raw.select().from(loginThrottle)).map((r) => r.key).sort();
    expect(keys).toEqual(["900011|1.1.1.1", "9000_|1.1.1.1"]);
  });

  it("treats % and _ literally", async () => {
    for (const k of ["9000x|1.1.1.1", "9000_|1.1.1.1"]) await hit(k, { db: ctx.db, now: NOW });
    await clearForUsername("9000_", { db: ctx.db, now: NOW });
    const keys = (await ctx.raw.select().from(loginThrottle)).map((r) => r.key);
    expect(keys).toEqual(["9000x|1.1.1.1"]);
  });
});
