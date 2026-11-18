import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { roles } from "@/db/schema";
import { createSuccessResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-middleware";
import { requireAdminAuth } from "@/lib/api-middleware";
import { eq } from "drizzle-orm";

export async function PUT(
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

    // Check if this is a system role
    const systemRoles = ["admin", "user"];
    if (systemRoles.includes(existingRole[0].name)) {
      return createSuccessResponse({ error: "Cannot toggle system roles" }, 400);
    }

    const [updatedRole] = await db
      .update(roles)
      .set({ 
        isActive: !existingRole[0].isActive,
        updatedAt: new Date()
      })
      .where(eq(roles.id, id))
      .returning();

    return createSuccessResponse({ role: updatedRole });
  } catch (error) {
    return handleApiError(error);
  }
}