import { and, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdminAuth, handleApiError, validateUuid } from "@/lib/api-middleware";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";

export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const userId = validateUuid(params.id);
    const [user] = await db
      .update(users)
      .set({ approvalStatus: "rejected", isActive: false, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.accountType, "sso")))
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        approvalStatus: users.approvalStatus,
      });

    if (!user) return createErrorResponse("User not found.", 404);
    return createSuccessResponse({ message: "User rejected successfully.", user });
  } catch (error) {
    return handleApiError(error);
  }
}
