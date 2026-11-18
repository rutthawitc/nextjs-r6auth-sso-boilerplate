import { z } from "zod";

import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";
import { startFreshSession } from "@/lib/auth/fresh-session";
import { getClientIp } from "@/lib/auth/client-ip";
import { AUTH_MESSAGES, throttleMessage } from "@/lib/auth/messages";
import { changeContractorPassword } from "@/lib/contractors/change-password";
import { PASSWORD_MESSAGES } from "@/lib/contractors/password";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  currentPassword: z.string().max(1024),
  newPassword: z.string().max(1024),
});

export async function POST(request: Request) {
  // Not requireActiveUser: it refuses `password_change_required`, which is
  // exactly the state this endpoint resolves. The service re-checks the DB.
  const session = await getSession();
  const sessionUser = session.isLoggedIn ? session.user : undefined;
  if (!sessionUser) {
    return createErrorResponse(AUTH_MESSAGES.sessionExpired, 401, { code: "NO_SESSION" });
  }
  if (sessionUser.kind !== "contractor") {
    return createErrorResponse(AUTH_MESSAGES.notAllowed, 403, { code: "NOT_ALLOWED" });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return createErrorResponse(AUTH_MESSAGES.invalid, 400, { code: "BAD_REQUEST" });
  }

  let result;
  try {
    result = await changeContractorPassword({
      userId: sessionUser.id,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ip: getClientIp(request.headers),
    });
  } catch (error) {
    console.error("Password change failed unexpectedly", error instanceof Error ? error.name : typeof error);
    return createErrorResponse(AUTH_MESSAGES.unavailable, 503, { code: "SERVICE_UNAVAILABLE" });
  }

  if (!result.ok) {
    switch (result.code) {
      case "TOO_MANY_ATTEMPTS": {
        const seconds = result.retryAfterSeconds ?? 60;
        const response = createErrorResponse(throttleMessage(seconds), 429, {
          code: result.code,
          retryAfterSeconds: seconds,
        });
        response.headers.set("Retry-After", String(seconds));
        return response;
      }
      case "INVALID_CURRENT":
        return createErrorResponse(AUTH_MESSAGES.currentPasswordWrong, 400, { code: result.code });
      case "WEAK_PASSWORD":
      case "SAME_PASSWORD":
        return createErrorResponse(
          PASSWORD_MESSAGES[result.problem ?? (result.code === "SAME_PASSWORD" ? "same_as_current" : "too_short")],
          400,
          { code: result.code },
        );
      case "NOT_ALLOWED":
        return createErrorResponse(AUTH_MESSAGES.notAllowed, 403, { code: result.code });
      default:
        return createErrorResponse(AUTH_MESSAGES.unavailable, 503, { code: "SERVICE_UNAVAILABLE" });
    }
  }

  await startFreshSession(session, result.user);
  return createSuccessResponse({ ok: true });
}
