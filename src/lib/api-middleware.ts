import { getSession } from "@/lib/session";
import { loadCurrentPrincipal } from "@/lib/auth/principal";
import { createErrorResponse } from "@/lib/api-response";
import { errorSummary } from "@/lib/log-error";
import { z } from "zod";

/**
 * Middleware to require admin authentication.
 * After the cookie check, the principal is re-read from the database so a
 * deactivated or demoted admin loses access immediately.
 */
export async function requireAdminAuth(): Promise<{
  session: Awaited<ReturnType<typeof getSession>>;
  error: null;
} | {
  session: null;
  error: Response;
}> {
  const session = await getSession();

  if (!session.isLoggedIn || !session.user) {
    return { session: null, error: createErrorResponse("Authentication required.", 401) };
  }

  if (session.user.role !== "admin") {
    return {
      session: null,
      error: createErrorResponse(
        "Access denied. Administrator privileges required.",
        403,
      ),
    };
  }

  let principal;
  try {
    principal = await loadCurrentPrincipal(session.user);
  } catch (error) {
    console.error("Principal lookup failed", error instanceof Error ? error.name : typeof error);
    return { session: null, error: createErrorResponse("An internal server error occurred.", 500) };
  }
  if (!principal.ok) {
    return {
      session: null,
      error: createErrorResponse(
        principal.status === 401
          ? "Authentication required."
          : "Access denied. Administrator privileges required.",
        principal.status,
      ),
    };
  }

  return { session, error: null };
}

/**
 * An error whose message is safe to show the client. Anything else reaching
 * handleApiError becomes a generic 500: database errors carry SQL and params.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Validates a UUID string
 * Returns the parsed UUID or throws an error
 */
export function validateUuid(id: string, fieldName: string = "id"): string {
  try {
    return z.string().uuid().parse(id);
  } catch {
    throw new ApiError(`Invalid ${fieldName}.`, 400);
  }
}

/**
 * Validates request JSON body against a Zod schema
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const json = await request.json();
    return await schema.parseAsync(json);
  } catch {
    throw new ApiError("Invalid payload.", 400);
  }
}

/**
 * Standardized error handler for API routes: ApiError keeps its message and
 * status; anything else is logged (class and codes only) and answers a generic 500.
 */
export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) return createErrorResponse(error.message, error.status);
  console.error("API Error", errorSummary(error));
  return createErrorResponse("An internal server error occurred.", 500);
}