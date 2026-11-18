import { and, asc, eq } from "drizzle-orm";

import { costCenters, roles, userRoles, users } from "@/db/schema";
import { db } from "@/lib/db";
import { unitOf } from "@/lib/users/unit";

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  title: string | null;
  unit: string | null;
  businessArea: string | null;
  costCenter: string | null;
  costCenterName: string | null;
  role: "admin" | "user";
  lastLogin: string | null;
  isActive: boolean;
  assignedRoles: Array<{ id: string; name: string; level: number }>;
  primaryRoleId: string | null;
  primaryRoleName: string | null;
  primaryRoleLevel: number | null;
};

export type PendingUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  title: string | null;
  unit: string | null;
  createdAt: string;
};

/** All SSO users with their RBAC role assignments (two queries, no N+1). */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      title: users.title,
      office: users.office,
      department: users.department,
      division: users.division,
      businessArea: users.businessArea,
      costCenter: users.costCenter,
      costCenterName: costCenters.name,
      role: users.role,
      lastLogin: users.lastLogin,
      isActive: users.isActive,
    })
    .from(users)
    .leftJoin(costCenters, eq(users.costCenter, costCenters.code))
    .where(eq(users.accountType, "sso"))
    .orderBy(asc(users.username), asc(users.id));

  const assignments = await db
    .select({
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      roleName: roles.name,
      roleLevel: roles.level,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id));

  const byUser = new Map<string, AdminUser["assignedRoles"]>();
  for (const a of assignments) {
    const list = byUser.get(a.userId) ?? [];
    list.push({ id: a.roleId, name: a.roleName, level: a.roleLevel });
    byUser.set(a.userId, list);
  }

  // Employee codes are numeric strings: natural order (2 before 10).
  rows.sort((a, b) => a.username.localeCompare(b.username, "en", { numeric: true }));

  return rows.map((u) => {
    const assignedRoles = byUser.get(u.id) ?? [];
    const primary = assignedRoles.reduce<AdminUser["assignedRoles"][number] | null>(
      (best, r) => (best === null || r.level > best.level ? r : best),
      null,
    );
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      title: u.title,
      unit: unitOf(u),
      businessArea: u.businessArea,
      costCenter: u.costCenter,
      costCenterName: u.costCenterName,
      role: u.role,
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
      isActive: u.isActive,
      assignedRoles,
      primaryRoleId: primary?.id ?? null,
      primaryRoleName: primary?.name ?? null,
      primaryRoleLevel: primary?.level ?? null,
    };
  });
}

export async function listPendingUsers(): Promise<PendingUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      title: users.title,
      office: users.office,
      department: users.department,
      division: users.division,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.accountType, "sso"), eq(users.approvalStatus, "pending")))
    .orderBy(asc(users.createdAt));

  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    title: u.title,
    unit: unitOf(u),
    createdAt: u.createdAt.toISOString(),
  }));
}
