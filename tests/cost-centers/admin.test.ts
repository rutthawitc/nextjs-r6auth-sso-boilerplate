import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { costCenterRoles, costCenters, roles } from "@/db/schema";
import {
  CostCenterRoleError,
  addCostCenterRole,
  deleteCostCenterRole,
  listCostCenterRoles,
  listCostCenters,
  upsertCostCenters,
} from "@/lib/cost-centers/admin";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let managerId: string;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw.delete(costCenterRoles);
  await ctx.raw.delete(costCenters);
  await ctx.raw.delete(roles);
  [{ id: managerId }] = await ctx.raw.insert(roles).values({ name: "Manager", level: 50 }).returning();
});

async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CostCenterRoleError) return e.code;
    throw e;
  }
  return "none";
}

describe("cost center admin service", () => {
  it("upsert is idempotent and updates name", async () => {
    expect(await upsertCostCenters([{ code: "900001", ba: "9001", name: "เดิม" }], ctx.db)).toBe(1);
    expect(await upsertCostCenters([{ code: "900001", ba: "9002", name: "ใหม่" }], ctx.db)).toBe(1);
    expect(await listCostCenters(ctx.db)).toEqual([{ code: "900001", ba: "9002", name: "ใหม่" }]);
  });

  it("adds, lists with center name and deletes a mapping", async () => {
    await upsertCostCenters([{ code: "900001", ba: "9001", name: "หน่วย ก" }], ctx.db);
    const added = await addCostCenterRole({ costCenter: "900001", roleId: managerId }, ctx.db);
    await addCostCenterRole({ costCenter: "900099", roleId: managerId }, ctx.db);
    const list = await listCostCenterRoles(ctx.db);
    expect(list).toEqual([
      { id: added.id, costCenter: "900001", roleId: managerId, roleName: "Manager", centerName: "หน่วย ก", ba: "9001" },
      expect.objectContaining({ costCenter: "900099", centerName: null, ba: null }),
    ]);
    await deleteCostCenterRole(added.id, ctx.db);
    expect(await listCostCenterRoles(ctx.db)).toHaveLength(1);
  });

  it("add duplicate -> duplicate", async () => {
    await addCostCenterRole({ costCenter: "900001", roleId: managerId }, ctx.db);
    expect(await errorCode(addCostCenterRole({ costCenter: "900001", roleId: managerId }, ctx.db))).toBe("duplicate");
  });

  it.each(["", "12a", "1".repeat(21), " 900001"])("invalid code %j", async (code) => {
    expect(await errorCode(addCostCenterRole({ costCenter: code, roleId: managerId }, ctx.db))).toBe("invalid_code");
  });

  it("base user role cannot be mapped", async () => {
    const [{ id: baseId }] = await ctx.raw.insert(roles).values({ name: "user", level: 1 }).returning();
    expect(await errorCode(addCostCenterRole({ costCenter: "900001", roleId: baseId }, ctx.db))).toBe("base_role");
  });

  it("unknown role", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await errorCode(addCostCenterRole({ costCenter: "900001", roleId: missing }, ctx.db))).toBe(
      "role_not_found",
    );
  });

  it("delete missing -> not_found", async () => {
    expect(await errorCode(deleteCostCenterRole("00000000-0000-4000-8000-000000000000", ctx.db))).toBe("not_found");
  });
});
