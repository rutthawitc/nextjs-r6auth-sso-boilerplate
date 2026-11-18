import bcrypt from "bcrypt";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { costCenterRoles, costCenters, localAdmins, roles } from "@/db/schema";
import { createTestDb } from "../helpers/pglite";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { DELETE as del } from "@/app/api/admin/cost-center-roles/[id]/route";
import { GET as list, POST as post } from "@/app/api/admin/cost-center-roles/route";
import { getSession } from "@/lib/session";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let rootId: string;
let managerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.raw;
  [{ id: rootId }] = await ctx.raw
    .insert(localAdmins)
    .values({ username: "root", password: await bcrypt.hash("x", 4) })
    .returning();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw.delete(costCenterRoles);
  await ctx.raw.delete(costCenters);
  await ctx.raw.delete(roles);
  [{ id: managerId }] = await ctx.raw.insert(roles).values({ name: "Manager" }).returning();
  await ctx.raw.insert(costCenters).values({ code: "900001", ba: "9001", name: "หน่วยทดสอบ ก" });
  vi.mocked(getSession).mockResolvedValue({
    isLoggedIn: true,
    user: { kind: "local", id: rootId, role: "admin", username: "root", displayName: "Root" },
  } as never);
});

const json = (body: unknown) =>
  new Request("http://localhost/api/admin/cost-center-roles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/admin/cost-center-roles", () => {
  it("non-admin 403", async () => {
    vi.mocked(getSession).mockResolvedValue({
      isLoggedIn: true,
      user: { kind: "sso", id: rootId, role: "user", username: "10001", displayName: "X" },
    } as never);
    expect((await list()).status).toBe(403);
    expect((await post(json({ costCenter: "900001", roleId: managerId }))).status).toBe(403);
  });

  it("GET returns mappings, cost centers and roles", async () => {
    const body = await (await list()).json();
    expect(body.costCenters).toEqual([{ code: "900001", ba: "9001", name: "หน่วยทดสอบ ก" }]);
    expect(body.roles).toEqual([expect.objectContaining({ id: managerId, name: "Manager" })]);
    expect(body.mappings).toEqual([]);
  });

  it("POST 201", async () => {
    const res = await post(json({ costCenter: "900001", roleId: managerId }));
    expect(res.status).toBe(201);
    expect((await (await list()).json()).mappings).toEqual([
      expect.objectContaining({ costCenter: "900001", roleName: "Manager", centerName: "หน่วยทดสอบ ก" }),
    ]);
  });

  it("409 on duplicate, 400 on bad code, 404 on unknown role", async () => {
    await post(json({ costCenter: "900001", roleId: managerId }));
    expect((await post(json({ costCenter: "900001", roleId: managerId }))).status).toBe(409);
    expect((await post(json({ costCenter: "abc", roleId: managerId }))).status).toBe(400);
    expect((await post(json({ costCenter: "900001", roleId: "not-a-uuid" }))).status).toBe(400);
    expect(
      (await post(json({ costCenter: "900001", roleId: "00000000-0000-4000-8000-000000000000" }))).status,
    ).toBe(404);
  });

  it("DELETE 200 then 404", async () => {
    await post(json({ costCenter: "900001", roleId: managerId }));
    const [{ id }] = (await (await list()).json()).mappings;
    expect((await del(new Request("http://localhost/x", { method: "DELETE" }), params(id))).status).toBe(200);
    expect((await del(new Request("http://localhost/x", { method: "DELETE" }), params(id))).status).toBe(404);
  });
});
