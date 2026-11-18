import { z } from "zod";

import { requireAdminAuth } from "@/lib/api-middleware";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";
import { deleteCostCenterRole } from "@/lib/cost-centers/admin";
import { db } from "@/lib/db";
import type { AppDb } from "@/lib/users/sync";

import { costCenterErrorResponse } from "../_http";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return createErrorResponse("ไม่พบรายการที่ต้องการลบ", 404);

  try {
    await deleteCostCenterRole(id, db as unknown as AppDb);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return costCenterErrorResponse(error);
  }
}
