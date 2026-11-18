import { z } from "zod";

import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";
import { getClientIp } from "@/lib/auth/client-ip";
import { attemptLogin, type LoginFailureCode } from "@/lib/auth/login";
import { AUTH_MESSAGES, throttleMessage } from "@/lib/auth/messages";
import { startFreshSession } from "@/lib/auth/fresh-session";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string(),
  password: z.string(),
});

const FAILURES: Record<Exclude<LoginFailureCode, "TOO_MANY_ATTEMPTS">, { status: number; message: string }> = {
  INVALID_CREDENTIALS: { status: 401, message: AUTH_MESSAGES.invalid },
  SERVICE_UNAVAILABLE: { status: 503, message: AUTH_MESSAGES.unavailable },
  INACTIVE: { status: 403, message: AUTH_MESSAGES.inactive },
  CONTRACT_NOT_STARTED: { status: 403, message: AUTH_MESSAGES.contractNotStarted },
  CONTRACT_ENDED: { status: 403, message: AUTH_MESSAGES.contractEnded },
};

export async function POST(request: Request) {
  const session = await getSession();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    session.destroy();
    return createErrorResponse(AUTH_MESSAGES.invalid, 400, { code: "INVALID_CREDENTIALS" });
  }

  let result;
  try {
    result = await attemptLogin({
      username: body.username,
      password: body.password,
      ip: getClientIp(request.headers),
    });
  } catch (error) {
    // Unexpected: never pass the raw message through.
    console.error("Login failed unexpectedly", error instanceof Error ? error.name : typeof error);
    session.destroy();
    return createErrorResponse(AUTH_MESSAGES.unavailable, 503, { code: "SERVICE_UNAVAILABLE" });
  }

  if (!result.ok) {
    session.destroy();
    if (result.code === "TOO_MANY_ATTEMPTS") {
      const seconds = result.retryAfterSeconds ?? 60;
      const response = createErrorResponse(throttleMessage(seconds), 429, {
        code: result.code,
        retryAfterSeconds: seconds,
      });
      response.headers.set("Retry-After", String(seconds));
      return response;
    }
    const { status, message } = FAILURES[result.code];
    return createErrorResponse(message, status, { code: result.code });
  }

  // Fresh session: drop anything left from a previous login.
  await startFreshSession(session, result.user);

  return createSuccessResponse({
    isLoggedIn: true,
    displayName: result.user.displayName,
    role: result.user.role,
    kind: result.user.kind,
  });
}
