import { requireAdminAuth, handleApiError } from "@/lib/api-middleware";
import { createSuccessResponse } from "@/lib/api-response";
import { listAdminUsers } from "@/lib/users/admin-list";

export async function GET() {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    return createSuccessResponse({ users: await listAdminUsers() });
  } catch (error) {
    return handleApiError(error);
  }
}
