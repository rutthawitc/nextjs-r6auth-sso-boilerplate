import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";
import { requireActiveUser } from "@/lib/auth/require-active-user";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { getSession } from "@/lib/session";

const FAILURES = {
  no_session: { message: "กรุณาเข้าสู่ระบบ", code: "UNAUTHENTICATED" },
  not_found: { message: AUTH_MESSAGES.sessionExpired, code: "SESSION_INVALID" },
  inactive: { message: AUTH_MESSAGES.inactive, code: "INACTIVE" },
  not_approved: { message: AUTH_MESSAGES.notAllowed, code: "NOT_APPROVED" },
  contract_not_started: { message: AUTH_MESSAGES.contractNotStarted, code: "CONTRACT_NOT_STARTED" },
  contract_ended: { message: AUTH_MESSAGES.contractEnded, code: "CONTRACT_ENDED" },
  password_change_required: { message: AUTH_MESSAGES.passwordChangeRequired, code: "PASSWORD_CHANGE_REQUIRED" },
} as const;

export async function GET() {
  let result;
  try {
    result = await requireActiveUser();
  } catch (error) {
    console.error("Principal lookup failed", error instanceof Error ? error.name : typeof error);
    return createErrorResponse(AUTH_MESSAGES.unavailable, 503, { code: "SERVICE_UNAVAILABLE" });
  }

  if (!result.ok) {
    // Spec 5.3: a contract outside its window ends the session (route handlers can set cookies; pages cannot).
    if (result.reason === "contract_ended" || result.reason === "contract_not_started") {
      try {
        (await getSession()).destroy();
      } catch (error) {
        console.error("Session destroy failed", error instanceof Error ? error.name : typeof error);
      }
    }
    const { message, code } = FAILURES[result.reason];
    return createErrorResponse(message, result.status, { code });
  }

  return createSuccessResponse({
    isLoggedIn: true,
    // Role comes from the database, not the cookie.
    user: { ...result.sessionUser, role: result.principal.role },
  });
}
