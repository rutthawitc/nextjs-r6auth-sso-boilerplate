import { db } from "@/lib/db";
import { systemSettings } from "@/db/schema";
import { requireAdminAuth, validateRequestBody, handleApiError } from "@/lib/api-middleware";
import { createSuccessResponse } from "@/lib/api-response";
import { z } from "zod";

const settingsSchema = z.object({
  registration_mode: z.enum(["allow_new_users", "must_approve"]),
});

export async function GET() {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const settings = await db.select().from(systemSettings);
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return createSuccessResponse({
      registration_mode: (map["registration_mode"] ?? "allow_new_users") as "allow_new_users" | "must_approve",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const body = await validateRequestBody(request, settingsSchema);
    await db
      .insert(systemSettings)
      .values({ key: "registration_mode", value: body.registration_mode })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: body.registration_mode, updatedAt: new Date() },
      });
    return createSuccessResponse({ registration_mode: body.registration_mode });
  } catch (error) {
    return handleApiError(error);
  }
}
