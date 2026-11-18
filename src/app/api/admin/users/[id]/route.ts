import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { requireAdminAuth } from "@/lib/api-middleware";
import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";

const updateSchema = z.object({
  role: z.enum(["admin", "user"]),
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

  const idSchema = z.string().uuid();
  let userId: string;
  try {
    userId = idSchema.parse(params.id);
  } catch {
    return createErrorResponse("Invalid user id.", 400);
  }

  let body: { role: "admin" | "user" };
  try {
    const json = await request.json();
    body = await updateSchema.parseAsync(json);
  } catch {
    return createErrorResponse("Invalid payload.", 400);
  }

  if (session.user.id === userId && body.role !== "admin") {
    return createErrorResponse(
      "You cannot remove your own administrator access.",
      400,
    );
  }

  try {
    const now = new Date();
    const [user] = await db
      .update(users)
      .set({ role: body.role, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.accountType, "sso")))
      .returning({
        id: users.id,
        role: users.role,
        username: users.username,
      });

    if (!user) {
      return createErrorResponse("User not found.", 404);
    }

    return createSuccessResponse({
      message: "User role updated successfully.",
      user: {
        id: user.id,
        role: user.role,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Failed to update user", error);
    return createErrorResponse("An internal server error occurred.");
  }
}
