/**
 * Node-only user persistence helpers shared by login and admin code.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { costCenterRoles, roles, systemSettings, userRoles, users, type SelectUser } from "@/db/schema";
import type { R6AuthUser } from "@/lib/r6auth/types";

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Thrown when an SSO login's username collides with a local contractor account. */
export class ContractorUsernameConflictError extends Error {
  constructor(username: string) {
    super(`Username "${username}" belongs to a contractor account.`);
    this.name = "ContractorUsernameConflictError";
  }
}

/** Ensures the baseline "user" role exists and returns its id (or null). */
export async function ensureBaseUserRole(tx: AppDb): Promise<string | null> {
  await tx
    .insert(roles)
    .values({ name: "user", description: "Default role for authenticated users", level: 1 })
    .onConflictDoNothing({ target: roles.name });
  const baseRole = await tx.query.roles.findFirst({ where: eq(roles.name, "user") });
  return baseRole?.id ?? null;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export interface SyncOptions {
  db?: AppDb;
  now?: Date;
}

/**
 * Persists an r6auth user into `users` and reconciles RBAC roles from
 * `cost_center_roles`. Never changes `role`, `isActive` or `approvalStatus`
 * of an existing user (only an admin may), and only touches roles that appear
 * in the cost center map.
 */
export async function syncSsoUser(ssoUser: R6AuthUser, options: SyncOptions = {}): Promise<SelectUser> {
  const db: AppDb = options.db ?? ((await import("@/lib/db")).db as unknown as AppDb);
  const now = options.now ?? new Date();
  const username = ssoUser.username.trim().toLowerCase();
  const costCenter = blankToNull(ssoUser.costcenter);

  return db.transaction(async (tx) => {
    const modeRow = await tx.query.systemSettings.findFirst({
      where: eq(systemSettings.key, "registration_mode"),
    });
    const approvalStatus = modeRow?.value === "must_approve" ? "pending" : "approved";

    const profile = {
      displayName: blankToNull(ssoUser.name) ?? username,
      firstName: blankToNull(ssoUser.first_name),
      lastName: blankToNull(ssoUser.last_name),
      nameEn: blankToNull(ssoUser.name_en),
      email: blankToNull(ssoUser.email),
      title: blankToNull(ssoUser.title),
      level: blankToNull(ssoUser.level),
      company: blankToNull(ssoUser.company),
      division: blankToNull(ssoUser.division),
      department: blankToNull(ssoUser.department),
      office: blankToNull(ssoUser.office),
      costCenter,
      businessArea: blankToNull(ssoUser.ba),
      ssoSub: blankToNull(ssoUser.sub),
      lastLogin: now,
      updatedAt: now,
    };

    const existing = await tx.query.users.findFirst({
      where: eq(users.username, username),
      columns: { accountType: true },
    });
    if (existing?.accountType === "contractor") throw new ContractorUsernameConflictError(username);

    const [user] = await tx
      .insert(users)
      .values({ username, ...profile, approvalStatus })
      .onConflictDoUpdate({
        target: users.username,
        set: profile,
        setWhere: eq(users.accountType, "sso"),
      })
      .returning();
    if (!user) throw new Error("Failed to upsert SSO user.");

    const baseRoleId = await ensureBaseUserRole(tx as unknown as AppDb);
    if (baseRoleId) {
      await tx
        .insert(userRoles)
        .values({ userId: user.id, roleId: baseRoleId, assignedBy: null })
        .onConflictDoNothing();
    }

    // Cost center -> role. Roles with no mapping row are never touched.
    const mappings = await tx
      .select({ costCenter: costCenterRoles.costCenter, roleId: roles.id, isActive: roles.isActive })
      .from(costCenterRoles)
      .innerJoin(roles, eq(costCenterRoles.roleId, roles.id));
    const managed = new Set(mappings.map((m) => m.roleId));
    const wanted = new Set(
      mappings.filter((m) => costCenter !== null && m.costCenter === costCenter && m.isActive).map((m) => m.roleId),
    );
    for (const roleId of wanted) {
      await tx.insert(userRoles).values({ userId: user.id, roleId, assignedBy: null }).onConflictDoNothing();
    }
    const unwanted = [...managed].filter((id) => !wanted.has(id));
    if (unwanted.length > 0) {
      await tx
        .delete(userRoles)
        .where(and(eq(userRoles.userId, user.id), inArray(userRoles.roleId, unwanted)));
    }

    return user;
  });
}
