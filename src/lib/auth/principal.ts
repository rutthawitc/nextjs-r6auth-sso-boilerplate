/**
 * Re-validates a session user against the database. The sealed cookie can
 * outlive an admin deactivating the account or changing its role.
 * `loadActivePrincipal` is the base check (any role); `loadCurrentPrincipal`
 * is the admin-only variant built on it so the two cannot drift.
 */
import { eq } from "drizzle-orm";

import { localAdmins, users } from "@/db/schema";
import { isWithinContract } from "@/lib/contractors/contract";
import type { SessionUser } from "@/lib/session-core";
import type { AppDb } from "@/lib/users/sync";

export interface ActivePrincipal {
  kind: "sso" | "local" | "contractor";
  id: string;
  username: string;
  /** Taken from the database, never from the cookie. */
  role: "admin" | "user";
}

export interface Principal extends ActivePrincipal {
  role: "admin";
}

type ActiveFailureReason =
  | "not_found"
  | "inactive"
  | "not_approved"
  | "contract_not_started"
  | "contract_ended"
  | "password_change_required";
type FailureReason = ActiveFailureReason | "not_admin";

export type ActivePrincipalResult =
  | { ok: true; principal: ActivePrincipal }
  | { ok: false; status: 401 | 403; reason: ActiveFailureReason };

export type PrincipalResult =
  | { ok: true; principal: Principal }
  | { ok: false; status: 401 | 403; reason: FailureReason };

/**
 * Resolves the current principal from the database (row exists, active, and
 * for SSO users approved), or says why not. Does not require admin.
 */
export async function loadActivePrincipal(
  sessionUser: Pick<SessionUser, "kind" | "id">,
  db?: AppDb,
  now: Date = new Date(),
): Promise<ActivePrincipalResult> {
  const conn: AppDb = db ?? ((await import("@/lib/db")).db as unknown as AppDb);

  if (sessionUser.kind === "local") {
    const [admin] = await conn
      .select()
      .from(localAdmins)
      .where(eq(localAdmins.id, sessionUser.id))
      .limit(1);
    if (!admin) return { ok: false, status: 401, reason: "not_found" };
    if (!admin.isActive) return { ok: false, status: 401, reason: "inactive" };
    return { ok: true, principal: { kind: "local", id: admin.id, username: admin.username, role: "admin" } };
  }

  if (sessionUser.kind === "sso") {
    const [user] = await conn
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);
    // A contractor id presented with an SSO session is a different account type.
    if (!user || user.accountType !== "sso") return { ok: false, status: 401, reason: "not_found" };
    if (!user.isActive) return { ok: false, status: 401, reason: "inactive" };
    if (user.approvalStatus !== "approved") return { ok: false, status: 403, reason: "not_approved" };
    return { ok: true, principal: { kind: "sso", id: user.id, username: user.username, role: user.role } };
  }

  if (sessionUser.kind === "contractor") {
    const [user] = await conn
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);
    if (!user || user.accountType !== "contractor") return { ok: false, status: 401, reason: "not_found" };
    if (!user.isActive) return { ok: false, status: 401, reason: "inactive" };
    if (user.approvalStatus !== "approved") return { ok: false, status: 403, reason: "not_approved" };
    // Fail closed: a contractor row without a contract window is treated as ended.
    if (!user.contractStart || !user.contractEnd) return { ok: false, status: 401, reason: "contract_ended" };
    const window = isWithinContract(user.contractStart, user.contractEnd, now);
    if (window === "not_started") return { ok: false, status: 401, reason: "contract_not_started" };
    if (window === "ended") return { ok: false, status: 401, reason: "contract_ended" };
    if (user.mustChangePassword) return { ok: false, status: 403, reason: "password_change_required" };
    // Contractors are never admins, whatever the row's role column says.
    return { ok: true, principal: { kind: "contractor", id: user.id, username: user.username, role: "user" } };
  }

  return { ok: false, status: 401, reason: "not_found" };
}

/** Like `loadActivePrincipal`, but additionally requires the DB role to be admin. */
export async function loadCurrentPrincipal(
  sessionUser: Pick<SessionUser, "kind" | "id">,
  db?: AppDb,
  now?: Date,
): Promise<PrincipalResult> {
  const result = await loadActivePrincipal(sessionUser, db, now);
  if (!result.ok) return result;
  if (result.principal.role !== "admin") return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, principal: { ...result.principal, role: "admin" } };
}
