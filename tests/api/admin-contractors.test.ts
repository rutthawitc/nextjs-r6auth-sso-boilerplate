import bcrypt from "bcrypt";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { localAdmins, loginThrottle, roles, userRoles, users } from "@/db/schema";
import { attemptLogin } from "@/lib/auth/login";
import { createTestDb } from "../helpers/pglite";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
// vitest cannot resolve concurrent dynamic imports of a mocked module (Promise.all test below),
// so hand the principal lookup the test database explicitly.
vi.mock("@/lib/auth/principal", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/principal")>();
  return {
    ...original,
    loadCurrentPrincipal: (u: Parameters<typeof original.loadCurrentPrincipal>[0]) =>
      original.loadCurrentPrincipal(u, holder.db as never),
  };
});

import { GET as getList, POST as postCreate } from "@/app/api/admin/contractors/route";
import { DELETE as deleteOne, PATCH as patchOne } from "@/app/api/admin/contractors/[id]/route";
import { PUT as putContract } from "@/app/api/admin/contractors/[id]/contract/route";
import { POST as postReset } from "@/app/api/admin/contractors/[id]/reset-password/route";
import { PUT as putActive } from "@/app/api/admin/contractors/[id]/active/route";
import { getSession } from "@/lib/session";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.raw;
  const [admin] = await ctx.raw
    .insert(localAdmins)
    .values({ username: "root", password: await bcrypt.hash("x", 4) })
    .returning();
  ids.root = admin.id;
  const created = await ctx.raw
    .insert(roles)
    .values([
      { name: "Super Admin", level: 999 },
      { name: "Admin", level: 100 },
      { name: "Manager", level: 50 },
      { name: "Viewer", level: 0 },
      { name: "Retired", level: 10, isActive: false },
    ])
    .returning();
  for (const r of created) ids[`role:${r.name}`] = r.id;
});
afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  vi.mocked(getSession).mockReset();
  await ctx.raw.delete(loginThrottle);
  await ctx.raw.delete(users);
  await ctx.raw.insert(users).values({ username: "10001", displayName: "SSO User" });
  asAdmin();
});

function asSession(user: { kind: string; id: string; role: "admin" | "user" } | null) {
  vi.mocked(getSession).mockResolvedValue({
    isLoggedIn: user !== null,
    user: user ? { ...user, username: "x", displayName: "X" } : undefined,
    save: vi.fn(),
    destroy: vi.fn(),
  } as never);
}
const asAdmin = () => asSession({ kind: "local", id: ids.root, role: "admin" });

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const valid = {
  username: "90001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  department: "งานบริการ",
  businessArea: "1234",
  contractStart: "2026-01-01",
  contractEnd: "2026-12-31",
  roleIds: [] as string[],
};
const create = (over: Record<string, unknown> = {}) => postCreate(req("POST", { ...valid, ...over }));
const row = async (id: string) => (await ctx.raw.select().from(users).where(eq(users.id, id)))[0];

async function seed(over: Record<string, unknown> = {}) {
  const res = await create(over);
  expect(res.status).toBe(201);
  return (await res.json()) as { contractor: { id: string; username: string }; generatedPassword?: string };
}

describe("admin guard", () => {
  it("returns 403 for non-admin and contractor sessions on every route", async () => {
    const { contractor } = await seed();
    for (const s of [
      { kind: "sso", id: "a", role: "user" as const },
      { kind: "contractor", id: contractor.id, role: "user" as const },
    ]) {
      asSession(s);
      const p = params(contractor.id);
      const statuses = [
        (await getList()).status,
        (await create()).status,
        (await patchOne(req("PATCH", valid), p)).status,
        (await putContract(req("PUT", { contractStart: "2026-01-01", contractEnd: "2026-02-01" }), p)).status,
        (await postReset(req("POST", {}), p)).status,
        (await putActive(req("PUT", { isActive: false }), p)).status,
        (await deleteOne(req("DELETE"), p)).status,
      ];
      expect(statuses).toEqual([403, 403, 403, 403, 403, 403, 403]);
    }
    expect(await row(contractor.id)).toBeDefined();
  });

  it("returns 401 without a session on every route", async () => {
    const { contractor } = await seed();
    asSession(null);
    const p = params(contractor.id);
    const statuses = [
      (await getList()).status,
      (await create()).status,
      (await patchOne(req("PATCH", valid), p)).status,
      (await putContract(req("PUT", { contractStart: "2026-01-01", contractEnd: "2026-02-01" }), p)).status,
      (await postReset(req("POST", {}), p)).status,
      (await putActive(req("PUT", { isActive: false }), p)).status,
      (await deleteOne(req("DELETE"), p)).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401]);
    expect(await row(contractor.id)).toBeDefined();
  });
});

describe("POST create", () => {
  it("generates a password and stores a contractor with base + chosen roles", async () => {
    const res = await create({ roleIds: [ids["role:Manager"]] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generatedPassword).toHaveLength(12);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const u = await row(body.contractor.id);
    expect(u).toMatchObject({
      accountType: "contractor",
      role: "user",
      approvalStatus: "approved",
      mustChangePassword: true,
      displayName: "สมชาย ใจดี",
      username: "90001",
    });
    expect(await bcrypt.compare(body.generatedPassword, u.passwordHash as string)).toBe(true);
    const assigned = await ctx.raw
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, u.id));
    expect(assigned.map((a) => a.name).sort()).toEqual(["Manager", "user"]);
    expect(body.contractor.roles.map((r: { name: string }) => r.name)).toEqual(["Manager"]);
  });

  it("uses an admin-supplied password and returns no generatedPassword", async () => {
    const body = await (await create({ password: "Secret-pass1" })).json();
    expect(body.generatedPassword).toBeUndefined();
    expect(await bcrypt.compare("Secret-pass1", (await row(body.contractor.id)).passwordHash as string)).toBe(true);
  });

  it("rejects a weak supplied password on field password", async () => {
    const res = await create({ password: "short" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_INPUT", field: "password" });
    expect((await create({ password: "ก".repeat(30) })).status).toBe(400);
  });

  it("only allows active roles with level <= 50", async () => {
    for (const r of ["Admin", "Super Admin", "Retired"]) {
      const res = await create({ roleIds: [ids[`role:${r}`]] });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("ROLE_NOT_ALLOWED");
    }
    expect((await create({ roleIds: ["nope"] })).status).toBe(400);
    expect((await create({ roleIds: [ids["role:Manager"], ids["role:Viewer"]] })).status).toBe(201);
    expect(await ctx.raw.select().from(users).where(eq(users.username, "90001"))).toHaveLength(1);
  });

  it("returns 409 USERNAME_TAKEN for an SSO user code and a local admin name", async () => {
    let res = await create({ username: "10001" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("USERNAME_TAKEN");
    await ctx.raw.insert(localAdmins).values({ username: "123", password: "x" });
    res = await create({ username: "123" });
    expect(res.status).toBe(409);
    await seed();
    expect((await create()).status).toBe(409);
  });

  it("maps a double submit to one 201 and one 409", async () => {
    const results = await Promise.all([create({ username: "90009" }), create({ username: "90009" })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.raw.select().from(users).where(eq(users.username, "90009"))).toHaveLength(1);
  });

  it("rejects invalid input with a field", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ username: "9a001" }, "username"],
      [{ contractStart: "2026-12-31", contractEnd: "2026-01-01" }, "contractEnd"],
      [{ contractStart: "2026-02-30" }, "contractStart"],
      [{ firstName: "" }, "firstName"],
      [{ firstName: "   " }, "firstName"],
    ];
    for (const [over, field] of cases) {
      const res = await create(over);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "INVALID_INPUT", field });
    }
  });
});

describe("GET list", () => {
  it("returns status, daysLeft, roles and never the hash", async () => {
    const { contractor } = await seed({ roleIds: [ids["role:Viewer"]] });
    await ctx.raw.update(users).set({ contractStart: "2020-01-01", contractEnd: "2020-01-31" }).where(eq(users.id, contractor.id));
    const res = await getList();
    expect(res.status).toBe(200);
    const text = JSON.stringify(await (await getList()).json());
    expect(text).not.toMatch(/passwordHash|\$2[aby]\$/);
    const body = await res.json();
    expect(body.contractors.map((c: { username: string }) => c.username)).toEqual(["90001"]);
    expect(body.contractors[0]).toMatchObject({ status: "ended", roles: [{ name: "Viewer" }] });
    expect(body.contractors[0].daysLeft).toBeLessThan(0);
    expect(body.assignableRoles.map((r: { name: string }) => r.name).sort()).toEqual(["Manager", "Viewer"]);
  });
});

describe("PATCH", () => {
  it("ignores username and replaces non-base roles", async () => {
    const { contractor } = await seed({ roleIds: [ids["role:Manager"]] });
    const res = await patchOne(
      req("PATCH", { ...valid, username: "99999", firstName: "สมหญิง", roleIds: [ids["role:Viewer"]] }),
      params(contractor.id),
    );
    expect(res.status).toBe(200);
    const u = await row(contractor.id);
    expect(u.username).toBe("90001");
    expect(u.displayName).toBe("สมหญิง ใจดี");
    const assigned = await ctx.raw
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, contractor.id));
    expect(assigned.map((a) => a.name).sort()).toEqual(["Viewer", "user"]);
  });

  it("rejects a role whose level was raised after creation", async () => {
    const { contractor } = await seed();
    await ctx.raw.update(roles).set({ level: 60 }).where(eq(roles.id, ids["role:Manager"]));
    try {
      const res = await patchOne(req("PATCH", { ...valid, roleIds: [ids["role:Manager"]] }), params(contractor.id));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("ROLE_NOT_ALLOWED");
    } finally {
      await ctx.raw.update(roles).set({ level: 50 }).where(eq(roles.id, ids["role:Manager"]));
    }
  });
});

describe("PUT contract", () => {
  it("updates dates and updatedAt; rejects end before start", async () => {
    const { contractor } = await seed();
    const before = (await row(contractor.id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const res = await putContract(req("PUT", { contractStart: "2027-01-01", contractEnd: "2027-12-31" }), params(contractor.id));
    expect(res.status).toBe(200);
    const u = await row(contractor.id);
    expect(u).toMatchObject({ contractStart: "2027-01-01", contractEnd: "2027-12-31" });
    expect(u.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    const bad = await putContract(req("PUT", { contractStart: "2027-02-01", contractEnd: "2027-01-01" }), params(contractor.id));
    expect(bad.status).toBe(400);
    expect((await row(contractor.id)).contractStart).toBe("2027-01-01");
  });
});

describe("POST reset-password", () => {
  it("sets mustChangePassword, verifies the new hash and clears throttle rows", async () => {
    const { contractor } = await seed();
    await ctx.raw.update(users).set({ mustChangePassword: false }).where(eq(users.id, contractor.id));
    await ctx.raw.insert(loginThrottle).values([
      { key: "90001|1.1.1.1", attempts: 5, resetAt: new Date("2099-01-01") },
      { key: "90002|1.1.1.1", attempts: 5, resetAt: new Date("2099-01-01") },
    ]);
    const res = await postReset(req("POST", {}), params(contractor.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generatedPassword).toHaveLength(12);
    const u = await row(contractor.id);
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(body.generatedPassword, u.passwordHash as string)).toBe(true);
    expect(await ctx.raw.select().from(loginThrottle).where(like(loginThrottle.key, "90001|%"))).toHaveLength(0);
    expect(await ctx.raw.select().from(loginThrottle).where(like(loginThrottle.key, "90002|%"))).toHaveLength(1);
  });

  it("accepts an empty body and a supplied password; rejects a weak one", async () => {
    const { contractor } = await seed();
    const empty = await postReset(new Request("http://localhost/x", { method: "POST" }), params(contractor.id));
    expect(empty.status).toBe(200);
    const ok = await postReset(req("POST", { password: "Another-pass9" }), params(contractor.id));
    expect((await ok.json()).generatedPassword).toBeUndefined();
    const weak = await postReset(req("POST", { password: "abc" }), params(contractor.id));
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ code: "INVALID_INPUT", field: "password" });
  });
});

describe("PUT active", () => {
  it("deactivates the contractor, who then gets INACTIVE at login", async () => {
    const { contractor } = await seed({ password: "Secret-pass1", contractStart: "2020-01-01", contractEnd: "2099-12-31" });
    const res = await putActive(req("PUT", { isActive: false }), params(contractor.id));
    expect(res.status).toBe(200);
    expect((await row(contractor.id)).isActive).toBe(false);
    const login = await attemptLogin(
      { username: "90001", password: "Secret-pass1", ip: "1.1.1.1" },
      { db: ctx.db },
    );
    expect(login).toEqual({ ok: false, code: "INACTIVE" });
    expect((await putActive(req("PUT", { isActive: true }), params(contractor.id))).status).toBe(200);
    expect((await row(contractor.id)).isActive).toBe(true);
  });
});

describe("SSO users are not contractors", () => {
  it("answers 404 for an SSO user id on every id route", async () => {
    const [ad] = await ctx.raw.select().from(users).where(and(eq(users.username, "10001")));
    const p = params(ad.id);
    const statuses = [
      (await patchOne(req("PATCH", valid), p)).status,
      (await putContract(req("PUT", { contractStart: "2026-01-01", contractEnd: "2026-02-01" }), p)).status,
      (await postReset(req("POST", {}), p)).status,
      (await putActive(req("PUT", { isActive: false }), p)).status,
      (await deleteOne(req("DELETE"), p)).status,
    ];
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
    expect(await row(ad.id)).toBeDefined();
    expect((await row(ad.id)).passwordHash).toBeNull();
    expect((await patchOne(req("PATCH", valid), params("not-a-uuid"))).status).toBe(404);
  });
});

describe("DELETE", () => {
  const rolesOf = (id: string) => ctx.raw.select().from(userRoles).where(eq(userRoles.userId, id));

  it("deletes an ended contractor with its roles and frees the code", async () => {
    const { contractor } = await seed({ roleIds: [ids["role:Manager"]], contractStart: "2020-01-01", contractEnd: "2020-12-31" });
    expect((await rolesOf(contractor.id)).length).toBeGreaterThan(0);
    const res = await deleteOne(req("DELETE"), params(contractor.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(await row(contractor.id)).toBeUndefined();
    expect(await rolesOf(contractor.id)).toHaveLength(0);
    expect((await create()).status).toBe(201);
  });

  it("deletes a deactivated contractor whose contract is still running", async () => {
    const { contractor } = await seed({ contractStart: "2020-01-01", contractEnd: "2099-12-31" });
    await ctx.raw.update(users).set({ isActive: false }).where(eq(users.id, contractor.id));
    expect((await deleteOne(req("DELETE"), params(contractor.id))).status).toBe(200);
    expect(await row(contractor.id)).toBeUndefined();
  });

  it("refuses active, expiring and not-started contractors with 409 NOT_DELETABLE", async () => {
    const today = new Date();
    const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const cases = [
      { username: "90011", contractStart: "2020-01-01", contractEnd: "2099-12-31" },
      { username: "90012", contractStart: "2020-01-01", contractEnd: day(10) },
      { username: "90013", contractStart: day(30), contractEnd: day(400) },
    ];
    for (const c of cases) {
      const { contractor } = await seed(c);
      const res = await deleteOne(req("DELETE"), params(contractor.id));
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("NOT_DELETABLE");
      expect(await row(contractor.id)).toBeDefined();
    }
  });

  it("answers 404 for an unknown or malformed id", async () => {
    expect((await deleteOne(req("DELETE"), params("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    expect((await deleteOne(req("DELETE"), params("not-a-uuid"))).status).toBe(404);
  });
});
