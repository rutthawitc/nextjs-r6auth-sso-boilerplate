import { asc } from "drizzle-orm";
import { z } from "zod";

import { roles } from "@/db/schema";
import { requireAdminAuth } from "@/lib/api-middleware";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";
import { addCostCenterRole, listCostCenterRoles, listCostCenters } from "@/lib/cost-centers/admin";
import { db } from "@/lib/db";
import type { AppDb } from "@/lib/users/sync";

import { costCenterErrorResponse } from "./_http";

export const runtime = "nodejs";

const appDb = () => db as unknown as AppDb;

const bodySchema = z.object({
  costCenter: z.string().trim(),
  roleId: z.string().uuid(),
});

export async function GET() {
  const auth = await requireAdminAuth();
  if (auth.error) return auth.error;
  try {
    const [mappings, costCenters, roleRows] = await Promise.all([
      listCostCenterRoles(appDb()),
      listCostCenters(appDb()),
      db
        .select({ id: roles.id, name: roles.name, isActive: roles.isActive })
        .from(roles)
        .orderBy(asc(roles.name)),
    ]);
    return createSuccessResponse({ mappings, costCenters, roles: roleRows });
  } catch (error) {
    return costCenterErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth();
  if (auth.error) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return createErrorResponse("ข้อมูลไม่ถูกต้อง", 400, { code: "INVALID_INPUT" });

  try {
    const row = await addCostCenterRole(parsed.data, appDb());
    return createSuccessResponse(row, 201);
  } catch (error) {
    return costCenterErrorResponse(error);
  }
}
