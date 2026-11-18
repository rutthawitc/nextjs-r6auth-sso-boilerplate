/**
 * Server-side guard for authenticated, non-admin surfaces (pages and route
 * handlers). Resolves the cookie session, then re-validates the account in
 * the database so a deactivated, rejected or deleted user loses access at
 * once instead of when the cookie expires. Do not call from proxy.ts (edge).
 */
import { loadActivePrincipal, type ActivePrincipal, type ActivePrincipalResult } from "@/lib/auth/principal";
import { getValidSessionUser } from "@/lib/session";
import type { SessionUser } from "@/lib/session-core";

export type ActiveUserResult =
  | { ok: true; sessionUser: SessionUser; principal: ActivePrincipal }
  | { ok: false; status: 401; reason: "no_session" }
  | Extract<ActivePrincipalResult, { ok: false }>;

/** Throws if the database lookup fails; callers decide how to surface that. */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const sessionUser = await getValidSessionUser();
  if (!sessionUser) return { ok: false, status: 401, reason: "no_session" };

  const result = await loadActivePrincipal(sessionUser);
  if (!result.ok) return result;
  return { ok: true, sessionUser, principal: result.principal };
}
