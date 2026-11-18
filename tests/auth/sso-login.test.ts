import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { costCenterRoles, roles, systemSettings, userRoles, users } from "@/db/schema";
import { attemptSsoLogin } from "@/lib/auth/sso-login";
import { FAKE_SSO_USERS, FakeR6AuthClient, type R6AuthClient, type R6AuthUser } from "@/lib/r6auth";
import { isSessionValid } from "@/lib/session-core";
import type { AppDb } from "@/lib/users/sync";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-01-01T00:00:00Z");

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw.delete(costCenterRoles);
  await ctx.raw.delete(userRoles);
  await ctx.raw.delete(users);
  await ctx.raw.delete(roles);
  await ctx.raw.delete(systemSettings);
});

function setup(over: { db?: AppDb; client?: R6AuthClient; allowedBa?: string[] } = {}) {
  const logger = { error: vi.fn() };
  const login = (code: string) =>
    attemptSsoLogin(
      { code },
      {
        db: ctx.db,
        client: new FakeR6AuthClient(() => NOW),
        allowedBa: [],
        now: () => NOW,
        logger,
        ...over,
      },
    );
  return { login, logger };
}

const stubClient = (user: Partial<R6AuthUser>, expiresAt = NOW.getTime() / 1000 + 3600): R6AuthClient => ({
  exchangeCode: async () => ({
    user: { ...FAKE_SSO_USERS[0], ...user },
    loginAt: NOW.getTime() / 1000,
    expiresAt,
  }),
});

const userRows = () => ctx.raw.select().from(users);

describe("attemptSsoLogin", () => {
  it("success returns sso session user and expiresAt in ms", async () => {
    const r = await setup().login("fake:10001");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await userRows();
    expect(r.user).toEqual({
      kind: "sso",
      id: row.id,
      username: "10001",
      role: "user",
      displayName: "นายสมชาย ใจดี",
      firstName: "สมชาย",
    });
    expect(r.expiresAt).toBe(NOW.getTime() + 28_800_000);
  });

  it("invalid grant -> SSO_EXPIRED", async () => {
    expect(await setup().login("bogus")).toEqual({ ok: false, code: "SSO_EXPIRED" });
  });

  it("outage -> SERVICE_UNAVAILABLE, nothing written", async () => {
    const { login, logger } = setup();
    expect(await login("fake:down")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await userRows()).toHaveLength(0);
    expect(JSON.stringify(logger.error.mock.calls)).toContain("R6AuthUnavailableError");
  });

  it("BA not allowed -> NOT_ALLOWED and no users row", async () => {
    expect(await setup({ allowedBa: ["1059"] }).login("fake:10003")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await userRows()).toHaveLength(0);
  });

  it("empty ba with allowlist", async () => {
    const r = await setup({ allowedBa: ["1059"], client: stubClient({ ba: "" }) }).login("x");
    expect(r).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await userRows()).toHaveLength(0);
  });

  it("empty allowlist admits 10003", async () => {
    expect((await setup().login("fake:10003")).ok).toBe(true);
  });

  it("allowed BA admits", async () => {
    expect((await setup({ allowedBa: ["1060", "1059"] }).login("fake:10001")).ok).toBe(true);
  });

  it("inactive -> INACTIVE", async () => {
    await ctx.raw.insert(users).values({ username: "10001", displayName: "X", isActive: false });
    expect(await setup().login("fake:10001")).toEqual({ ok: false, code: "INACTIVE" });
  });

  it("pending -> PENDING_APPROVAL", async () => {
    await ctx.raw.insert(systemSettings).values({ key: "registration_mode", value: "must_approve" });
    expect(await setup().login("fake:10001")).toEqual({ ok: false, code: "PENDING_APPROVAL" });
  });

  it("rejected -> REJECTED", async () => {
    await ctx.raw.insert(users).values({ username: "10001", displayName: "X", approvalStatus: "rejected" });
    expect(await setup().login("fake:10001")).toEqual({ ok: false, code: "REJECTED" });
  });

  it("expiresAt just passed (within a minute) -> SERVICE_UNAVAILABLE, not a session that is already invalid", async () => {
    const justPast = NOW.getTime() / 1000 - 30;
    const { login, logger } = setup({ client: stubClient({}, justPast) });
    expect(await login("x")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await userRows()).toHaveLength(0);
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain("unusable session");
    expect(logged).toContain(String(NOW.getTime()));
  });

  it("expiresAt exactly now -> SERVICE_UNAVAILABLE", async () => {
    const r = await setup({ client: stubClient({}, NOW.getTime() / 1000) }).login("x");
    expect(r).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
  });

  it("a successful login yields a session that isSessionValid accepts", async () => {
    const soon = NOW.getTime() / 1000 + 1;
    const r = await setup({ client: stubClient({}, soon) }).login("x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = { isLoggedIn: true, user: r.user, loginAt: NOW.getTime(), expiresAt: r.expiresAt };
    expect(isSessionValid(data, NOW.getTime(), 480)).toBe(true);
  });

  it("sync failure logs the error class and code only, not the query params", async () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const queryError = new Error("Failed query: insert into users\nparams: 10001,นายสมชาย ใจดี,somchai@example.com", {
      cause,
    });
    const broken = {
      transaction: () => {
        throw queryError;
      },
      select: () => {
        throw queryError;
      },
      insert: () => {
        throw queryError;
      },
    } as unknown as AppDb;
    const { login, logger } = setup({ db: broken });
    expect(await login("fake:10001")).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain("SSO user sync failed");
    expect(logged).toContain("23505");
    expect(logged).not.toContain("สมชาย");
    expect(logged).not.toContain("somchai@example.com");
    expect(logged).not.toContain("Failed query");
  });

  it("outage log keeps the r6auth reason", async () => {
    const { login, logger } = setup();
    await login("fake:down");
    expect(JSON.stringify(logger.error.mock.calls)).toContain("fake r6auth is down");
  });

  it("expired expiresAt -> SERVICE_UNAVAILABLE", async () => {
    const past = NOW.getTime() / 1000 - 120;
    const r = await setup({ client: stubClient({}, past) }).login("x");
    expect(r).toEqual({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await userRows()).toHaveLength(0);
  });

  it("contractor conflict -> ACCOUNT_CONFLICT, logged with the username", async () => {
    await ctx.raw.insert(users).values({
      username: "10001",
      displayName: "c",
      accountType: "contractor",
      passwordHash: "x",
      contractStart: "2026-01-01",
      contractEnd: "2026-12-31",
    });
    const { login, logger } = setup();
    expect(await login("fake:10001")).toEqual({ ok: false, code: "ACCOUNT_CONFLICT" });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain("ContractorUsernameConflictError");
    expect(logged).toContain("10001");
    const [row] = await userRows();
    expect(row.accountType).toBe("contractor");
  });

  it("role comes from DB", async () => {
    await ctx.raw.insert(users).values({ username: "10001", displayName: "X", role: "admin" });
    const r = await setup().login("fake:10001");
    expect(r.ok && r.user.role).toBe("admin");
  });

  it("username is normalised to lower case", async () => {
    const r = await setup({ client: stubClient({ username: " AB10001 " }) }).login("x");
    expect(r.ok && r.user.username).toBe("ab10001");
  });

  it("never logs the code", async () => {
    const { login, logger } = setup();
    await login("fake:down");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("fake:down");
  });
});
