import { z } from "zod";

import { requireAdminAuth } from "@/lib/api-middleware";
import { createErrorResponse } from "@/lib/api-response";
import { ContractorError } from "@/lib/contractors/admin";
import { db } from "@/lib/db";
import type { AppDb } from "@/lib/users/sync";

/** Shared DB handle, passed explicitly to the service (static import, like the other admin routes). */
export const appDb = db as unknown as AppDb;

export const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const profileFields = {
  firstName: trimmed(200),
  lastName: trimmed(200),
  department: trimmed(200),
  businessArea: trimmed(200),
  phone: z.string().trim().max(50).optional().nullable(),
  roleIds: z.array(z.string()).max(50),
};

const STATUS = {
  USERNAME_TAKEN: 409,
  INVALID_INPUT: 400,
  ROLE_NOT_ALLOWED: 400,
  NOT_FOUND: 404,
  NOT_DELETABLE: 409,
} as const;

/** Admin guard that also yields the acting admin's id. */
export async function guard(): Promise<{ actorId: string } | { error: Response }> {
  const auth = await requireAdminAuth();
  if (auth.error) return { error: auth.error };
  if (!auth.session.user) return { error: createErrorResponse("Authentication required.", 401) };
  return { actorId: auth.session.user.id };
}

/** Parses the JSON body; returns a 400 response on any shape problem. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: createErrorResponse("Invalid payload.", 400, { code: "INVALID_INPUT" }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error: createErrorResponse("Invalid payload.", 400, {
        code: "INVALID_INPUT",
        ...(typeof field === "string" ? { field } : {}),
      }),
    };
  }
  return { data: parsed.data };
}

export function contractorErrorResponse(error: unknown): Response {
  if (error instanceof ContractorError) {
    return createErrorResponse(error.message, STATUS[error.code], {
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
  }
  console.error("Contractor admin API failed", error instanceof Error ? error.name : typeof error);
  return createErrorResponse("An internal server error occurred.");
}

