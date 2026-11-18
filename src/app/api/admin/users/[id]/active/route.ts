import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { ApiError, requireAdminAuth, validateRequestBody, validateUuid, handleApiError } from "@/lib/api-middleware";
import { createSuccessResponse } from "@/lib/api-response";

const updateActiveSchema = z.object({
  isActive: z.boolean(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;
  
  // TypeScript now knows session is not null since error is null
  const { session } = authResult;

  try {
    const userId = validateUuid(params.id);
    const { isActive } = await validateRequestBody(request, updateActiveSchema);

    // Prevent self-deactivation
    if (!session.user) {
      throw new ApiError("Session user not found.", 401);
    }
    
    if (session.user.id === userId) {
      throw new ApiError("You cannot deactivate your own account.", 400);
    }

    const now = new Date();
    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.accountType, "sso")))
      .returning({
        id: users.id,
        isActive: users.isActive,
        username: users.username,
        displayName: users.displayName,
      });

    if (!user) {
      throw new ApiError("User not found.", 404);
    }

    return createSuccessResponse({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`,
      user: {
        id: user.id,
        isActive: user.isActive,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}