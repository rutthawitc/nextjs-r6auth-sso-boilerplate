import { z } from "zod";

import { createSuccessResponse } from "@/lib/api-response";
import { resetContractorPassword } from "@/lib/contractors/admin";

import { appDb, contractorErrorResponse, guard, parseBody } from "../../_http";

export const runtime = "nodejs";

const schema = z.object({ password: z.string().max(1024).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const g = await guard();
  if ("error" in g) return g.error;
  // The body is optional: an empty body means "generate a password".
  const text = await request.text();
  const body = await parseBody(new Request(request.url, { method: "POST", body: text || "{}" }), schema);
  if ("error" in body) return body.error;
  try {
    const result = await resetContractorPassword(id, body.data, { db: appDb, actorId: g.actorId });
    return createSuccessResponse(result);
  } catch (error) {
    return contractorErrorResponse(error);
  }
}
