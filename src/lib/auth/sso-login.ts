/**
 * SSO login service: turns an r6auth authorization code into a session user.
 * Pure logic with injectable dependencies; the callback route maps the result
 * to redirects. No throttle here: there is no password.
 */
import type { R6AuthClient } from "@/lib/r6auth/client";
import { errorSummary } from "@/lib/log-error";
import { InvalidGrantError, R6AuthUnavailableError } from "@/lib/r6auth/errors";
import { isSsoExpired, type SessionUser } from "@/lib/session-core";
import { ContractorUsernameConflictError, syncSsoUser, type AppDb } from "@/lib/users/sync";

export type SsoLoginFailureCode =
  | "SSO_EXPIRED"
  | "SERVICE_UNAVAILABLE"
  | "NOT_ALLOWED"
  | "INACTIVE"
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "ACCOUNT_CONFLICT";

export type SsoLoginResult =
  | { ok: true; user: SessionUser; /** Epoch milliseconds. */ expiresAt: number }
  | { ok: false; code: SsoLoginFailureCode };

export interface SsoLoginDeps {
  db?: AppDb;
  client?: R6AuthClient;
  allowedBa?: string[];
  now?: () => Date;
  logger?: Pick<Console, "error">;
}

const fail = (code: SsoLoginFailureCode): SsoLoginResult => ({ ok: false, code });

/**
 * Log payload without error messages (Drizzle puts query params there). The
 * one exception is R6AuthUnavailableError, whose messages this app writes
 * itself (HTTP status, OAuth error code) and never contain user data.
 */
function errorInfo(error: unknown, username?: string) {
  return {
    ...(username ? { username } : {}),
    ...errorSummary(error),
    ...(error instanceof R6AuthUnavailableError ? { message: error.message } : {}),
  };
}

export async function attemptSsoLogin(input: { code: string }, deps: SsoLoginDeps = {}): Promise<SsoLoginResult> {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());

  // 1. Exchange the code (server to server, with the client secret).
  let result;
  try {
    const client = deps.client ?? (await import("@/lib/r6auth")).getR6AuthClient();
    result = await client.exchangeCode(input.code);
  } catch (error) {
    if (error instanceof InvalidGrantError) return fail("SSO_EXPIRED");
    logger.error("r6auth code exchange failed", errorInfo(error));
    return fail("SERVICE_UNAVAILABLE");
  }

  // 2. Sanity of the answer.
  const username = result.user.username.trim().toLowerCase();
  const expiresAtMs = result.expiresAt * 1000;
  // Same expiry rule as isSessionValid: accepting an expiresAt that the session
  // check already rejects would log the user in and bounce them straight out.
  const nowMs = now().getTime();
  if (username === "" || !Number.isFinite(expiresAtMs) || isSsoExpired(expiresAtMs, nowMs)) {
    // Both clocks are logged so that skew between r6auth and this server shows up.
    logger.error("r6auth returned an unusable session", { username, expiresAtMs, nowMs });
    return fail("SERVICE_UNAVAILABLE");
  }

  // 3. BA allow-list, before any row is written.
  let allowedBa: string[];
  try {
    allowedBa = deps.allowedBa ?? (await import("@/lib/r6auth")).getR6AuthConfig().allowedBa;
  } catch (error) {
    logger.error("r6auth configuration invalid", errorInfo(error, username));
    return fail("SERVICE_UNAVAILABLE");
  }
  if (allowedBa.length > 0 && !allowedBa.includes(result.user.ba.trim())) return fail("NOT_ALLOWED");

  // 4. Persist the profile and cost-center roles.
  let user;
  try {
    user = await syncSsoUser({ ...result.user, username }, { db: deps.db, now: now() });
  } catch (error) {
    logger.error("SSO user sync failed", errorInfo(error, username));
    // The employee code is already a contractor's username: an admin must resolve it.
    if (error instanceof ContractorUsernameConflictError) return fail("ACCOUNT_CONFLICT");
    return fail("SERVICE_UNAVAILABLE");
  }

  // 5. Account state.
  if (!user.isActive) return fail("INACTIVE");
  if (user.approvalStatus === "pending") return fail("PENDING_APPROVAL");
  if (user.approvalStatus === "rejected") return fail("REJECTED");

  return {
    ok: true,
    user: {
      kind: "sso",
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      ...(user.firstName ? { firstName: user.firstName } : {}),
    },
    expiresAt: expiresAtMs,
  };
}
