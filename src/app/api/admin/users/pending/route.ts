import { requireAdminAuth, handleApiError } from "@/lib/api-middleware";
import { createSuccessResponse } from "@/lib/api-response";
import { listPendingUsers } from "@/lib/users/admin-list";

export async function GET() {
  const authResult = await requireAdminAuth();
  if (authResult.error) return authResult.error;

  try {
    const rows = await listPendingUsers();
    return createSuccessResponse({ users: rows, count: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
