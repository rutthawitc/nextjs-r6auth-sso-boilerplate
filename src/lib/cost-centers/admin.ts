/** Node-only admin service for cost center reference data and cost center -> role mappings. */
import { asc, eq, sql } from "drizzle-orm";

import { costCenterRoles, costCenters, roles } from "@/db/schema";
import type { AppDb } from "@/lib/users/sync";

import type { CostCenterRow } from "./csv";

export const COST_CENTER_CODE = /^\d{1,20}$/;
/** The baseline role every SSO user receives (see ensureBaseUserRole). */
export const BASE_ROLE_NAME = "user";

export class CostCenterRoleError extends Error {
  constructor(readonly code: "duplicate" | "role_not_found" | "invalid_code" | "not_found" | "base_role") {
    super(`Cost center role error: ${code}`);
    this.name = "CostCenterRoleError";
  }
}

export interface CostCenterRoleView {
  id: string;
  costCenter: string;
  roleId: string;
  roleName: string;
  centerName: string | null;
  ba: string | null;
}

async function conn(db?: AppDb): Promise<AppDb> {
  return db ?? ((await import("@/lib/db")).db as unknown as AppDb);
}

/** Inserts or updates every row; never deletes. Returns the number of rows written. */
export async function upsertCostCenters(rows: CostCenterRow[], db?: AppDb): Promise<number> {
  if (rows.length === 0) return 0;
  const c = await conn(db);
  await c
    .insert(costCenters)
    .values(rows.map((r) => ({ code: r.code, ba: r.ba, name: r.name })))
    .onConflictDoUpdate({
      target: costCenters.code,
      set: { ba: sql`excluded.ba`, name: sql`excluded.name`, updatedAt: sql`now()` },
    });
  return rows.length;
}

export async function listCostCenters(db?: AppDb): Promise<CostCenterRow[]> {
  const c = await conn(db);
  return c
    .select({ code: costCenters.code, ba: costCenters.ba, name: costCenters.name })
    .from(costCenters)
    .orderBy(asc(costCenters.ba), asc(costCenters.code));
}

export async function listCostCenterRoles(db?: AppDb): Promise<CostCenterRoleView[]> {
  const c = await conn(db);
  return c
    .select({
      id: costCenterRoles.id,
      costCenter: costCenterRoles.costCenter,
      roleId: roles.id,
      roleName: roles.name,
      centerName: costCenters.name,
      ba: costCenters.ba,
    })
    .from(costCenterRoles)
    .innerJoin(roles, eq(costCenterRoles.roleId, roles.id))
    .leftJoin(costCenters, eq(costCenterRoles.costCenter, costCenters.code))
    .orderBy(asc(costCenterRoles.costCenter), asc(roles.name));
}

export async function addCostCenterRole(
  input: { costCenter: string; roleId: string },
  db?: AppDb,
): Promise<{ id: string }> {
  if (!COST_CENTER_CODE.test(input.costCenter)) throw new CostCenterRoleError("invalid_code");
  const c = await conn(db);
  const [role] = await c.select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
  if (!role) throw new CostCenterRoleError("role_not_found");
  // Every SSO user gets the base role; mapping it would strip it from everyone outside the cost center.
  if (role.name === BASE_ROLE_NAME) throw new CostCenterRoleError("base_role");
  const [row] = await c
    .insert(costCenterRoles)
    .values({ costCenter: input.costCenter, roleId: input.roleId })
    .onConflictDoNothing()
    .returning({ id: costCenterRoles.id });
  if (!row) throw new CostCenterRoleError("duplicate");
  return row;
}

export async function deleteCostCenterRole(id: string, db?: AppDb): Promise<void> {
  const c = await conn(db);
  const deleted = await c.delete(costCenterRoles).where(eq(costCenterRoles.id, id)).returning({ id: costCenterRoles.id });
  if (deleted.length === 0) throw new CostCenterRoleError("not_found");
}
