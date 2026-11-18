import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { localAdmins, loginThrottle, roles, systemSettings, userRoles, users } from "@/db/schema";
import { attemptLogin, type LoginDeps } from "@/lib/auth/login";
import { check, throttleKey } from "@/lib/auth/throttle";
import type { AppDb } from "@/lib/users/sync";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-01-01T00:00:00Z");
const IP = "9.9.9.9";

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

let adminPw: string;
beforeEach(async () => {
  await ctx.raw.delete(loginThrottle);
  await ctx.raw.delete(userRoles);
  await ctx.raw.delete(users);
  await ctx.raw.delete(roles);
  await ctx.raw.delete(systemSettings);
  await ctx.raw.delete(localAdmins);
  adminPw ??= await bcrypt.hash("Pass123!", 4);
  await ctx.raw.insert(localAdmins).values([
    { username: "root", password: adminPw, displayName: "Root Admin" },
    { username: "off", password: adminPw, isActive: false },
  ]);
});

function setup(over: Partial<LoginDeps> = {}) {
  const logger = { error: vi.fn() };
  const deps: LoginDeps = {
    db: ctx.db,
    now: () => NOW,
    logger,
    ...over,
  };
  const login = (username: string, password: string) => attemptLogin({ username, password, ip: IP }, deps);
  return { login, logger, deps };
}

const attemptsFor = async (name: string) => {
  const [row] = await ctx.raw
    .select()
    .from(loginThrottle)
    .where(eq(loginThrottle.key, throttleKey(name, IP)));
  return row?.attempts ?? 0;
};

const userRows = () => ctx.raw.select().from(users);

describe("input validation", () => {
  it.each([
    ["control char in username", "10001\n", "password"],
    ["NUL in username", "100\u000001", "password"],
    ["DEL in username", "10001\u007f", "password"],
    ["empty username", "", "password"],
    ["too long username", "a".repeat(101), "password"],
    ["empty password", "10001", ""],
    ["too long password", "10001", "p".repeat(1025)],
  ])("%s -> INVALID_CREDENTIALS without a throttle hit", async (_n, u, p) => {
    const { login } = setup();
    expect(await login(u, p)).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await ctx.raw.select().from(loginThrottle)).toHaveLength(0);
  });

  it("username empty after normalize -> INVALID_CREDENTIALS without a throttle hit", async () => {
    const { login } = setup();
    expect(await login("PWA\\", "password")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await login("  @pwa.local", "password")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await ctx.raw.select().from(loginThrottle)).toHaveLength(0);
  });
});

describe("unknown accounts", () => {
  it("unknown username records a throttle hit and fails without any directory", async () => {
    const { login } = setup();
    expect(await login("10001", "x")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect((await check(throttleKey("10001", IP), { db: ctx.db, now: NOW })).locked).toBe(false);
    expect(await attemptsFor("10001")).toBe(1);
    expect(await userRows()).toHaveLength(0);
  });

  it("an SSO-only user row is not a password account", async () => {
    await ctx.raw.insert(users).values({ username: "90002", displayName: "X" });
    expect(await setup().login("90002", "whatever")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await attemptsFor("90002")).toBe(1);
  });
});

describe("throttling", () => {
  it("locks after 5 failed attempts", async () => {
    const { login } = setup();
    for (let i = 0; i < 5; i++) {
      expect(await login("PWA\\10001", "wrong")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    }
    expect(await login("10001", "password")).toEqual({ ok: false, code: "TOO_MANY_ATTEMPTS", retryAfterSeconds: 60 });
  });

  it("shares the counter across username spellings and case", async () => {
    const { login } = setup();
    await login("PWA\\10001", "x");
    await login("10001@pwa.local", "x");
    expect(await attemptsFor("10001")).toBe(2);
  });

  it("is per username and ip", async () => {
    const { deps } = setup();
    for (let i = 0; i < 5; i++) await attemptLogin({ username: "root", password: "x", ip: IP }, deps);
    const other = await attemptLogin({ username: "root", password: "Pass123!", ip: "8.8.8.8" }, deps);
    expect(other.ok).toBe(true);
  });

  it("logs DB failures without the query text or params", async () => {
    const queryError = new Error("Failed query: select ... where username = $1\nparams: 10001", {
      cause: Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }),
    });
    const broken = { select: () => { throw queryError; } } as unknown as AppDb;
    const { login, logger } = setup({ db: broken });
    expect(await login("10001", "password")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain("Failed query");
  });

  it("returns SERVICE_UNAVAILABLE when the throttle store fails", async () => {
    const broken = { select: () => { throw new Error("db down"); } } as unknown as AppDb;
    const { login, logger } = setup({ db: broken });
    expect(await login("10001", "password")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("local admin", () => {
  it("logs in with the raw (case-insensitive) username and updates lastLogin", async () => {
    const { login } = setup();
    const r = await login("  ROOT ", "Pass123!");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user).toMatchObject({ kind: "local", username: "root", role: "admin", displayName: "Root Admin" });
    const [row] = await ctx.raw.select().from(localAdmins).where(eq(localAdmins.username, "root"));
    expect(row.lastLogin).not.toBeNull();
  });

  it("falls back to the username when there is no display name", async () => {
    await ctx.raw.update(localAdmins).set({ displayName: null }).where(eq(localAdmins.username, "root"));
    const r = await setup().login("root", "Pass123!");
    expect(r.ok && r.user.displayName).toBe("root");
  });

  it("clears the throttle on success", async () => {
    const { login } = setup();
    await login("root", "bad"); // wrong password -> hit
    expect(await attemptsFor("root")).toBe(1);
    await login("root", "Pass123!");
    expect(await attemptsFor("root")).toBe(0);
  });

  it("inactive admin with the right password -> INACTIVE", async () => {
    expect(await setup().login("off", "Pass123!")).toEqual({ ok: false, code: "INACTIVE" });
  });

  it("wrong password -> INVALID_CREDENTIALS with a throttle hit", async () => {
    expect(await setup().login("root", "wrong")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await attemptsFor("root")).toBe(1);
  });

  it("is looked up by the raw input, not the normalized name", async () => {
    // "PWA\root" normalizes to "root" but must not match the local admin "root"
    const { login } = setup();
    expect(await login("PWA\\root", "Pass123!")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  });
});

describe("contractor", () => {
  let cHash: string;
  const seed = async (over: Partial<typeof users.$inferInsert> = {}) => {
    cHash ??= await bcrypt.hash("Temp1234!", 4);
    await ctx.raw.insert(users).values({
      username: "90001",
      displayName: "สมชาย ใจดี",
      firstName: "สมชาย",
      accountType: "contractor",
      passwordHash: cHash,
      contractStart: "2025-06-01",
      contractEnd: "2026-06-30",
      mustChangePassword: true,
      ...over,
    });
  };

  it("logs in, clears the throttle and sets last_login", async () => {
    await seed();
    const { login } = setup();
    await login("90001", "wrong");
    expect(await attemptsFor("90001")).toBe(1);
    const r = await login("90001", "Temp1234!");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await userRows();
    expect(r.user).toEqual({
      kind: "contractor",
      id: row.id,
      username: "90001",
      role: "user",
      displayName: "สมชาย ใจดี",
      firstName: "สมชาย",
      mustChangePassword: true,
    });
    expect(await attemptsFor("90001")).toBe(0);
    expect(row.lastLogin).not.toBeNull();
  });

  it("always gets role user even if the row says admin", async () => {
    await seed({ role: "admin" });
    const r = await setup().login("90001", "Temp1234!");
    expect(r.ok && r.user.role).toBe("user");
  });

  it.each(["PWA\\90001", " 90001 ", "90001@pwa.local"])("accepts the spelling %j", async (name) => {
    await seed();
    const r = await setup().login(name, "Temp1234!");
    expect(r.ok && r.user.kind).toBe("contractor");
  });

  it("wrong password -> INVALID_CREDENTIALS, one hit", async () => {
    await seed();
    const { login } = setup();
    expect(await login("90001", "password")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
    expect(await attemptsFor("90001")).toBe(1);
  });

  it("locks after 5 wrong passwords", async () => {
    await seed();
    const { login } = setup();
    for (let i = 0; i < 5; i++) await login("90001", "bad");
    expect(await login("90001", "Temp1234!")).toMatchObject({ ok: false, code: "TOO_MANY_ATTEMPTS" });
  });

  it("inactive -> INACTIVE without a hit", async () => {
    await seed({ isActive: false });
    expect(await setup().login("90001", "Temp1234!")).toEqual({ ok: false, code: "INACTIVE" });
    expect(await attemptsFor("90001")).toBe(0);
  });

  it("inactive with a wrong password does not reveal state", async () => {
    await seed({ isActive: false });
    expect(await setup().login("90001", "nope")).toEqual({ ok: false, code: "INVALID_CREDENTIALS" });
  });

  it("before the contract starts -> CONTRACT_NOT_STARTED without a hit", async () => {
    await seed();
    const early = setup({ now: () => new Date("2025-05-31T00:00:00Z") });
    expect(await early.login("90001", "Temp1234!")).toEqual({ ok: false, code: "CONTRACT_NOT_STARTED" });
    expect(await attemptsFor("90001")).toBe(0);
  });

  it("after the contract ends -> CONTRACT_ENDED without a hit", async () => {
    await seed();
    const late = setup({ now: () => new Date("2026-06-30T17:00:00Z") });
    expect(await late.login("90001", "Temp1234!")).toEqual({ ok: false, code: "CONTRACT_ENDED" });
    expect(await attemptsFor("90001")).toBe(0);
    const lastDay = setup({ now: () => new Date("2026-06-30T16:59:59Z") });
    expect((await lastDay.login("90001", "Temp1234!")).ok).toBe(true);
  });

  it("DB error during the contractor lookup -> SERVICE_UNAVAILABLE, no hit", async () => {
    await seed();
    const flaky = new Proxy(ctx.db, {
      get(target, prop, receiver) {
        if (prop === "select") {
          return (...args: unknown[]) => {
            const b = (target.select as (...a: unknown[]) => { from: (t: unknown) => unknown })(...args);
            return { from: (t: unknown) => { if (t === users) throw new Error("users down"); return b.from(t); } };
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as AppDb;
    const { login, logger } = setup({ db: flaky });
    expect(await login("90001", "Temp1234!")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await attemptsFor("90001")).toBe(0);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("Temp1234!");
  });

  const failingDb = (method: "update" | "delete") =>
    new Proxy(ctx.db, {
      get(target, prop, receiver) {
        if (prop === method) return () => { throw new Error(`${method} failed`); };
        return Reflect.get(target, prop, receiver);
      },
    }) as AppDb;

  it("last_login update failure -> SERVICE_UNAVAILABLE, no hit, password not logged", async () => {
    await seed();
    const { login, logger } = setup({ db: failingDb("update") });
    expect(await login("90001", "Temp1234!")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await attemptsFor("90001")).toBe(0);
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("Temp1234!");
  });

  it("throttle clear failure is logged and the login still succeeds", async () => {
    await seed();
    const { login, logger } = setup({ db: failingDb("delete") });
    const r = await login("90001", "Temp1234!");
    expect(r.ok && r.user.kind).toBe("contractor");
    expect(logger.error).toHaveBeenCalled();
  });

});
