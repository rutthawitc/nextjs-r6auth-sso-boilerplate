import { z } from "zod";

import { createSuccessResponse } from "@/lib/api-response";
import { renewContract } from "@/lib/contractors/admin";

import { appDb, contractorErrorResponse, guard, parseBody } from "../../_http";

export const runtime = "nodejs";

const schema = z.object({ contractStart: z.string(), contractEnd: z.string() });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  try {
    const contractor = await renewContract(id, body.data, { db: appDb, actorId: g.actorId });
    return createSuccessResponse({ contractor });
  } catch (error) {
    return contractorErrorResponse(error);
  }
}
