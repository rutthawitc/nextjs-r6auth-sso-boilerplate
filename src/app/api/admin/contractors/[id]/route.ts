import { z } from "zod";

import { createSuccessResponse } from "@/lib/api-response";
import { deleteContractor, updateContractor } from "@/lib/contractors/admin";

import { appDb, contractorErrorResponse, guard, parseBody, profileFields } from "../_http";

export const runtime = "nodejs";

// `username` is deliberately absent: the code is immutable, unknown keys are stripped.
const patchSchema = z.object(profileFields);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  try {
    const contractor = await updateContractor(id, body.data, { db: appDb, actorId: g.actorId });
    return createSuccessResponse({ contractor });
  } catch (error) {
    return contractorErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const g = await guard();
  if ("error" in g) return g.error;
  try {
    await deleteContractor(id, { db: appDb, actorId: g.actorId });
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return contractorErrorResponse(error);
  }
}
