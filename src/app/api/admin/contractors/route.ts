import { z } from "zod";

import { createSuccessResponse } from "@/lib/api-response";
import { createContractor, listAssignableRoles, listContractors } from "@/lib/contractors/admin";

import { appDb, contractorErrorResponse, guard, parseBody, profileFields } from "./_http";

export const runtime = "nodejs";

const createSchema = z.object({
  username: z.string().trim().min(1).max(20),
  ...profileFields,
  contractStart: z.string(),
  contractEnd: z.string(),
  password: z.string().max(1024).optional(),
});

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  try {
    const contractors = await listContractors({ db: appDb });
    const assignableRoles = await listAssignableRoles({ db: appDb });
    return createSuccessResponse({ contractors, assignableRoles });
  } catch (error) {
    return contractorErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  try {
    const result = await createContractor(body.data, { db: appDb, actorId: g.actorId });
    return createSuccessResponse(result, 201);
  } catch (error) {
    return contractorErrorResponse(error);
  }
}
