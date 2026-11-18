import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { costCenters, localAdmins, roles, userRoles, users } from "@/db/schema";
import { createTestDb } from "../helpers/pglite";

// Route handlers import `db` from "@/lib/db"; point it at an in-memory PGlite.
const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { PUT as putUser } from "@/app/api/admin/users/[id]/route";
import { PUT as putActive } from "@/app/api/admin/users/[id]/active/route";
import { PUT as putApprove } from "@/app/api/admin/users/[id]/approve/route";
import { PUT as putReject } from "@/app/api/admin/users/[id]/reject/route";
import { listAdminUsers, listPendingUsers } from "@/lib/users/admin-list";
import { GET as getRoles, PUT as putRoles } from "@/app/api/admin/users/[id]/roles/route";
import { getSession } from "@/lib/session";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const ids: Record<string, string> = {};
const MISSING = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.raw;
  const [admin] = await ctx.raw
    .insert(localAdmins)
    .values({ username: "root", password: await bcrypt.hash("x", 4) })
    .returning();
  ids.root = admin.id;
  const [adAdmin] = await ctx.raw
    .insert(users)
    .values({ username: "10002", displayName: "SSO Admin", role: "admin" })
    .returning();
  ids.adAdmin = adAdmin.id;
  const created = await ctx.raw
    .insert(roles)
    .values([
      { name: "Admin", level: 100 },
      { name: "Viewer", level: 10 },
      { name: "Retired", level: 50, isActive: false },
    ])
    .returning();
  for (const r of created) ids[`role:${r.name}`] = r.id;
});
afterAll(async () => {
  await ctx.close();
});

let target: string;
beforeEach(async () => {
  vi.mocked(getSession).mockReset();
  await ctx.raw.delete(users).where(eq(users.username, "10001"));
  const [row] = await ctx.raw
    .insert(users)
    .values({ username: "10001", displayName: "สมชาย ใจดี", approvalStatus: "pending" })
    .returning();
  target = row.id;
});

function asSession(user: { kind: "local" | "sso"; id: string; role: "admin" | "user" } | null) {
  vi.mocked(getSession).mockResolvedValue({
    isLoggedIn: user !== null,
    user: user ? { ...user, username: "x", displayName: "X" } : undefined,
    save: vi.fn(),
    destroy: vi.fn(),
  } as never);
}
const asLocalAdmin = () => asSession({ kind: "local", id: ids.root, role: "admin" });

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body?: unknown) =>
  new Request("http://localhost/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const userRow = async (id: string) => (await ctx.raw.select().from(users).where(eq(users.id, id)))[0];

describe("admin guard on /api/admin/users/[id]/*", () => {
  it("returns 401 without a session and 403 for a non-admin cookie", async () => {
    asSession(null);
    expect((await putApprove(put(), params(target))).status).toBe(401);
    asSession({ kind: "sso", id: target, role: "user" });
    expect((await putApprove(put(), params(target))).status).toBe(403);
    expect((await userRow(target)).approvalStatus).toBe("pending");
  });

  it("re-checks the DB: a demoted SSO admin with an admin cookie is refused", async () => {
    asSession({ kind: "sso", id: target, role: "admin" });
    expect((await putApprove(put(), params(target))).status).toBe(403);
  });
});

describe("PUT approve / reject", () => {
  it("approves a pending user and activates them", async () => {
    asLocalAdmin();
    const res = await putApprove(put(), params(target));
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: target, approvalStatus: "approved" });
    expect(await userRow(target)).toMatchObject({ approvalStatus: "approved", isActive: true });
  });

  it("rejects a user and deactivates them", async () => {
    asLocalAdmin();
    const res = await putReject(put(), params(target));
    expect(res.status).toBe(200);
    expect(await userRow(target)).toMatchObject({ approvalStatus: "rejected", isActive: false });
  });

  it("returns 404 for an unknown user", async () => {
    asLocalAdmin();
    expect((await putApprove(put(), params(MISSING))).status).toBe(404);
    expect((await putReject(put(), params(MISSING))).status).toBe(404);
  });

  it("returns 400 for a non-UUID id without leaking the database error", async () => {
    asLocalAdmin();
    for (const handler of [putApprove, putReject]) {
      const res = await handler(put(), params("not-a-uuid"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid id.");
    }
  });
});

describe("PUT active", () => {
  it("deactivates and reactivates a user", async () => {
    asLocalAdmin();
    let res = await putActive(put({ isActive: false }), params(target));
    expect(res.status).toBe(200);
    expect((await userRow(target)).isActive).toBe(false);
    res = await putActive(put({ isActive: true }), params(target));
    expect(res.status).toBe(200);
    expect((await userRow(target)).isActive).toBe(true);
  });

  it("refuses to let an admin deactivate their own account", async () => {
    asSession({ kind: "sso", id: ids.adAdmin, role: "admin" });
    const res = await putActive(put({ isActive: false }), params(ids.adAdmin));
    expect(res.status).toBe(400);
    expect((await userRow(ids.adAdmin)).isActive).toBe(true);
  });

  it("validates the body and the id", async () => {
    asLocalAdmin();
    expect((await putActive(put({ isActive: "no" }), params(target))).status).toBe(400);
    expect((await putActive(put({ isActive: false }), params("not-a-uuid"))).status).toBe(400);
    expect((await putActive(put({ isActive: false }), params(MISSING))).status).toBe(404);
    expect((await userRow(target)).isActive).toBe(true);
  });
});

describe("PUT / GET roles", () => {
  it("replaces the RBAC role and maps level >= 100 to users.role admin", async () => {
    asLocalAdmin();
    let res = await putRoles(put({ roleId: ids["role:Viewer"] }), params(target));
    expect(res.status).toBe(200);
    expect((await res.json()).assignment).toMatchObject({ userId: target, assignedBy: ids.root });
    expect((await userRow(target)).role).toBe("user");

    res = await putRoles(put({ roleId: ids["role:Admin"] }), params(target));
    expect(res.status).toBe(200);
    expect((await userRow(target)).role).toBe("admin");
    const assigned = await ctx.raw.select().from(userRoles).where(eq(userRoles.userId, target));
    expect(assigned.map((a) => a.roleId)).toEqual([ids["role:Admin"]]);

    res = await getRoles(put(), params(target));
    expect(res.status).toBe(200);
    expect((await res.json()).roles).toEqual([expect.objectContaining({ roleName: "Admin", roleLevel: 100 })]);
  });

  it("rejects an inactive or unknown role, an unknown user and a bad payload", async () => {
    asLocalAdmin();
    expect((await putRoles(put({ roleId: ids["role:Retired"] }), params(target))).status).toBe(404);
    expect((await putRoles(put({ roleId: MISSING }), params(target))).status).toBe(404);
    expect((await putRoles(put({ roleId: ids["role:Viewer"] }), params(MISSING))).status).toBe(404);
    expect((await putRoles(put({ roleId: "x" }), params(target))).status).toBe(400);
    expect((await putRoles(put({ roleId: ids["role:Viewer"] }), params("not-a-uuid"))).status).toBe(400);
    expect((await getRoles(put(), params("not-a-uuid"))).status).toBe(400);
    expect(await ctx.raw.select().from(userRoles).where(eq(userRoles.userId, target))).toEqual([]);
  });
});

describe("contractor rows are invisible to SSO admin APIs", () => {
  let cid: string;
  beforeEach(async () => {
    await ctx.raw.delete(users).where(eq(users.username, "90001"));
    const [c] = await ctx.raw
      .insert(users)
      .values({
        username: "90001",
        displayName: "สมชาย ใจดี",
        accountType: "contractor",
        passwordHash: await bcrypt.hash("x", 4),
        contractStart: "2025-06-01",
        contractEnd: "2026-06-30",
        approvalStatus: "pending",
      })
      .returning();
    cid = c.id;
  });

  it("excludes contractors from the user and pending lists", async () => {
    expect((await listAdminUsers()).map((u) => u.username)).not.toContain("90001");
    expect((await listPendingUsers()).map((u) => u.username)).not.toContain("90001");
  });

  it("answers 404 for a contractor id and leaves the row unchanged", async () => {
    asLocalAdmin();
    expect((await putActive(put({ isActive: false }), params(cid))).status).toBe(404);
    expect((await putApprove(put(), params(cid))).status).toBe(404);
    expect((await putReject(put(), params(cid))).status).toBe(404);
    expect((await putRoles(put({ roleId: ids["role:Viewer"] }), params(cid))).status).toBe(404);
    expect((await putUser(put({ role: "admin" }), params(cid))).status).toBe(404);
    expect((await getRoles(put(), params(cid))).status).toBe(404);
    expect(await userRow(cid)).toMatchObject({ isActive: true, approvalStatus: "pending", role: "user" });
  });
});

describe("listAdminUsers cost center", () => {
  it("shows the cost center name when it is in cost_centers", async () => {
    await ctx.raw.insert(costCenters).values({ code: "900001", ba: "9001", name: "หน่วยทดสอบ ก" }).onConflictDoNothing();
    await ctx.raw.update(users).set({ costCenter: "900001", businessArea: "9001" }).where(eq(users.id, target));
    const row = (await listAdminUsers()).find((u) => u.id === target);
    expect(row).toMatchObject({ costCenter: "900001", costCenterName: "หน่วยทดสอบ ก", businessArea: "9001" });
    const admin = (await listAdminUsers()).find((u) => u.id === ids.adAdmin);
    expect(admin).toMatchObject({ costCenter: null, costCenterName: null });
  });
});
