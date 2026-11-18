import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";

import { users, userRoles, roles } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdminAuth, validateUuid } from "@/lib/api-middleware";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";

const updateRoleSchema = z.object({
  roleId: z.string().uuid(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;
  const { session } = authResult;
  if (!session.user) return createErrorResponse("Authentication required.", 401);

  let userId: string;
  try {
    userId = validateUuid(params.id);
  } catch {
    return createErrorResponse("Invalid id.", 400);
  }

  let body: { roleId: string };
  try {
    const json = await request.json();
    body = await updateRoleSchema.parseAsync(json);
  } catch {
    return createErrorResponse("Invalid payload.", 400);
  }

  try {
    // Check if the role exists and is active
    const role = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, body.roleId), eq(roles.isActive, true)))
      .limit(1);

    if (role.length === 0) {
      return createErrorResponse("Role not found or inactive.", 404);
    }

    // Check if the user exists
    const user = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.accountType, "sso")))
      .limit(1);

    if (user.length === 0) {
      return createErrorResponse("User not found.", 404);
    }

    // Remove existing role assignments for this user
    await db.delete(userRoles).where(eq(userRoles.userId, userId));

    // Assign the new role
    const [newAssignment] = await db
      .insert(userRoles)
      .values({
        userId: userId,
        roleId: body.roleId,
        assignedBy: session.user.id,
      })
      .returning();

    // Update the user's legacy role field based on the new role's level
    let legacyRole: "admin" | "user" = "user";
    if (role[0].level >= 100) {
      legacyRole = "admin";
    }

    await db
      .update(users)
      .set({ role: legacyRole, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return createSuccessResponse({
      message: "User role updated successfully.",
      assignment: {
        id: newAssignment.id,
        userId: newAssignment.userId,
        roleId: newAssignment.roleId,
        assignedAt: newAssignment.assignedAt,
        assignedBy: newAssignment.assignedBy,
      },
      role: {
        id: role[0].id,
        name: role[0].name,
        level: role[0].level,
      },
    });
  } catch (error) {
    console.error("Failed to update user role", error);
    return createErrorResponse("An internal server error occurred.");
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  let userId: string;
  try {
    userId = validateUuid(params.id);
  } catch {
    return createErrorResponse("Invalid id.", 400);
  }

  try {
    // /api/admin/users* is SSO-only; contractors are managed under /api/admin/contractors.
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.accountType, "sso")))
      .limit(1);
    if (!owner) return createErrorResponse("User not found.", 404);

    // Get user's assigned roles
    const userRolesData = await db
      .select({
        roleId: userRoles.roleId,
        roleName: roles.name,
        roleLevel: roles.level,
        roleDescription: roles.description,
        assignedAt: userRoles.assignedAt,
        assignedBy: userRoles.assignedBy,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))
      .orderBy(asc(roles.level));

    return createSuccessResponse({ 
      roles: userRolesData,
      userId: userId,
    });
  } catch (error) {
    console.error("Failed to fetch user roles", error);
    return createErrorResponse("An internal server error occurred.");
  }
}