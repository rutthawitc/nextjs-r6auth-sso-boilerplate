import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { roles } from "@/db/schema";
import { createSuccessResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-middleware";
import { requireAdminAuth } from "@/lib/api-middleware";
import { eq } from "drizzle-orm";

export async function GET() {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const allRoles = await db.select().from(roles);
    return createSuccessResponse({ roles: allRoles });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { name, description, permissions, level } = body;

    if (!name?.trim()) {
      return createSuccessResponse({ error: "Role name is required" }, 400);
    }

    if (!Array.isArray(permissions)) {
      return createSuccessResponse({ error: "Permissions must be an array" }, 400);
    }

    if (typeof level !== "number" || level < 0) {
      return createSuccessResponse({ error: "Level must be a non-negative number" }, 400);
    }

    // Check if role name already exists
    const existingRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, name.trim()))
      .limit(1);

    if (existingRole.length > 0) {
      return createSuccessResponse({ error: "Role name already exists" }, 400);
    }

    const [newRole] = await db
      .insert(roles)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        permissions,
        level: level || 0,
        isActive: true,
      })
      .returning();

    return createSuccessResponse({ role: newRole }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}