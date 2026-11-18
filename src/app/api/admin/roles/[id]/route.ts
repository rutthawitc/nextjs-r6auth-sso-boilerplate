import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { roles } from "@/db/schema";
import { createSuccessResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-middleware";
import { requireAdminAuth } from "@/lib/api-middleware";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;
    const role = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    if (role.length === 0) {
      return createSuccessResponse({ error: "Role not found" }, 404);
    }

    return createSuccessResponse({ role: role[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, permissions, level, isActive } = body;

    if (name !== undefined && !name?.trim()) {
      return createSuccessResponse({ error: "Role name cannot be empty" }, 400);
    }

    if (permissions !== undefined && !Array.isArray(permissions)) {
      return createSuccessResponse({ error: "Permissions must be an array" }, 400);
    }

    if (level !== undefined && (typeof level !== "number" || level < 0)) {
      return createSuccessResponse({ error: "Level must be a non-negative number" }, 400);
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return createSuccessResponse({ error: "isActive must be a boolean" }, 400);
    }

    // Check if role exists
    const existingRole = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    if (existingRole.length === 0) {
      return createSuccessResponse({ error: "Role not found" }, 404);
    }

    // Check if role name already exists (if name is being changed)
    if (name && name !== existingRole[0].name) {
      const nameConflict = await db
        .select()
        .from(roles)
        .where(eq(roles.name, name.trim()))
        .limit(1);

      if (nameConflict.length > 0) {
        return createSuccessResponse({ error: "Role name already exists" }, 400);
      }
    }

    const updateData: Partial<typeof roles.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (level !== undefined) updateData.level = level;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updatedRole] = await db
      .update(roles)
      .set(updateData)
      .where(eq(roles.id, id))
      .returning();

    return createSuccessResponse({ role: updatedRole });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;
    // Check if role exists
    const existingRole = await db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    if (existingRole.length === 0) {
      return createSuccessResponse({ error: "Role not found" }, 404);
    }

    // Check if this is a system role that shouldn't be deleted
    const systemRoles = ["admin", "user"];
    if (systemRoles.includes(existingRole[0].name)) {
      return createSuccessResponse({ error: "Cannot delete system roles" }, 400);
    }

    await db.delete(roles).where(eq(roles.id, id));

    return createSuccessResponse({ message: "Role deleted successfully" });
  } catch (error) {
    return handleApiError(error);
  }
}