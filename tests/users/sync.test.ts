import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { costCenterRoles, roles, systemSettings, userRoles, users } from "@/db/schema";
import { FAKE_SSO_USERS, type R6AuthUser } from "@/lib/r6auth";
import { ContractorUsernameConflictError, syncSsoUser } from "@/lib/users/sync";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-01-01T00:00:00Z");
const somchai: R6AuthUser = { ...FAKE_SSO_USERS[0] };

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

const sync = (u: R6AuthUser = somchai) => syncSsoUser(u, { db: ctx.db, now: NOW });
const role = async (name: string, isActive = true) =>
  (await ctx.raw.insert(roles).values({ name, isActive }).returning())[0];
const mapCc = (costCenter: string, roleId: string) => ctx.raw.insert(costCenterRoles).values({ costCenter, roleId });
const roleNames = async (userId: string) =>
  (
    await ctx.raw
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))
  )
    .map((r) => r.name)
    .sort();

describe("syncSsoUser", () => {
  it("creates sso user with profile", async () => {
    const row = await sync({ ...somchai, username: " 10001 " });
    expect(row).toMatchObject({
      username: "10001",
      accountType: "sso",
      displayName: "นายสมชาย ใจดี",
      firstName: "สมชาย",
      lastName: "ใจดี",
      nameEn: "Mr.Somchai Jaidee",
      email: "somchai@example.com",
      title: "นักวิชาการคอมพิวเตอร์",
      level: "7",
      company: null,
      division: "กองตัวอย่าง",
      department: "แผนกตัวอย่าง",
      office: "งานตัวอย่าง",
      costCenter: "101932",
      businessArea: "1059",
      ssoSub: "fake-10001",
      approvalStatus: "approved",
      role: "user",
    });
    expect(row.lastLogin).toEqual(NOW);
    expect(await roleNames(row.id)).toEqual(["user"]);
  });

  it("uses the username when r6auth has no name", async () => {
    expect((await sync({ ...somchai, name: "" })).displayName).toBe("10001");
  });

  it("updates profile but keeps role, is_active, approval_status", async () => {
    await ctx.raw.insert(users).values({
      username: "10001",
      displayName: "old",
      role: "admin",
      isActive: false,
      approvalStatus: "rejected",
    });
    const row = await sync();
    expect(row).toMatchObject({ displayName: "นายสมชาย ใจดี", role: "admin", isActive: false, approvalStatus: "rejected" });
  });

  it("must_approve makes new user pending", async () => {
    await ctx.raw.insert(systemSettings).values({ key: "registration_mode", value: "must_approve" });
    expect((await sync()).approvalStatus).toBe("pending");
  });

  it("contractor username conflict throws", async () => {
    await ctx.raw.insert(users).values({
      username: "10001",
      displayName: "c",
      accountType: "contractor",
      passwordHash: "x",
      contractStart: "2026-01-01",
      contractEnd: "2026-12-31",
    });
    await expect(sync()).rejects.toBeInstanceOf(ContractorUsernameConflictError);
  });

  it("costcenter map adds matching active role", async () => {
    const manager = await role("Manager");
    await mapCc("101932", manager.id);
    const row = await sync();
    expect(await roleNames(row.id)).toEqual(["Manager", "user"]);
  });

  it("skips inactive mapped role", async () => {
    const manager = await role("Manager", false);
    await mapCc("101932", manager.id);
    expect(await roleNames((await sync()).id)).toEqual(["user"]);
  });

  it("removes managed role when costcenter changes", async () => {
    const manager = await role("Manager");
    await mapCc("101932", manager.id);
    const row = await sync();
    expect(await roleNames(row.id)).toContain("Manager");
    await sync({ ...somchai, costcenter: "101931" });
    expect(await roleNames(row.id)).toEqual(["user"]);
  });

  it("keeps admin-assigned unmanaged role", async () => {
    const viewer = await role("Viewer");
    const manager = await role("Manager");
    await mapCc("999999", manager.id);
    const row = await sync();
    await ctx.raw.insert(userRoles).values({ userId: row.id, roleId: viewer.id });
    await sync();
    expect(await roleNames(row.id)).toEqual(["Viewer", "user"]);
  });

  it("empty costcenter matches nothing", async () => {
    const manager = await role("Manager");
    await mapCc("", manager.id);
    const row = await sync({ ...somchai, costcenter: "" });
    expect(await roleNames(row.id)).toEqual(["user"]);
    const [link] = await ctx.raw
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, row.id), eq(userRoles.roleId, manager.id)));
    expect(link).toBeUndefined();
  });
});
