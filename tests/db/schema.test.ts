import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { costCenterRoles, roles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/pglite";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;

const contractor = {
  username: "90001",
  displayName: "สมชาย ใจดี",
  accountType: "contractor" as const,
  passwordHash: "x",
  contractStart: "2026-01-01",
  contractEnd: "2026-12-31",
};

describe("contractor account schema", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("defaults rows to account_type 'sso'", async () => {
    const [row] = await ctx.raw
      .insert(users)
      .values({ username: "10001", displayName: "สมชาย ใจดี" })
      .returning();
    expect(row.accountType).toBe("sso");
    expect(row.mustChangePassword).toBe(false);
  });

  it("accepts a complete contractor row", async () => {
    const [row] = await ctx.raw.insert(users).values(contractor).returning();
    expect(row.accountType).toBe("contractor");
    expect(row.contractStart).toBe("2026-01-01");
    expect(row.contractEnd).toBe("2026-12-31");
  });

  it.each([
    ["password_hash", { passwordHash: null }],
    ["contract_start", { contractStart: null }],
    ["contract_end", { contractEnd: null }],
  ])("rejects a contractor without %s", async (_name, override) => {
    await expect(
      ctx.raw.insert(users).values({ ...contractor, username: `9${Math.random()}`, ...override }),
    ).rejects.toThrow();
  });

  it("rejects contract_end before contract_start", async () => {
    await expect(
      ctx.raw.insert(users).values({
        ...contractor,
        username: "90002",
        contractStart: "2026-12-31",
        contractEnd: "2026-01-01",
      }),
    ).rejects.toThrow();
  });

  it("rejects an sso row with a password_hash", async () => {
    await expect(
      ctx.raw
        .insert(users)
        .values({ username: "10002", displayName: "สมชาย ใจดี", passwordHash: "x" }),
    ).rejects.toThrow();
  });
});

describe("cost center role mapping schema", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("rejects a duplicate (cost_center, role_id) and cascades on role delete", async () => {
    const [role] = await ctx.raw.insert(roles).values({ name: "Manager" }).returning();
    await ctx.raw.insert(costCenterRoles).values({ costCenter: "900001", roleId: role.id });
    await expect(
      ctx.raw.insert(costCenterRoles).values({ costCenter: "900001", roleId: role.id }),
    ).rejects.toThrow();
    await ctx.raw.delete(roles).where(eq(roles.id, role.id));
    expect(await ctx.raw.select().from(costCenterRoles)).toHaveLength(0);
  });
});
