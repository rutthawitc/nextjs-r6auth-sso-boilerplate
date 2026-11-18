import { createSuccessResponse } from "@/lib/api-response";
import { db } from "@/lib/db";
import { checkHealth } from "@/lib/health";
import type { AppDb } from "@/lib/users/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public and unauthenticated: the body carries no details beyond the failure reason.
export async function GET() {
  const result = await checkHealth(db as unknown as AppDb);
  if (!result.ok) console.error("Health check failed", result.reason);
  return createSuccessResponse(
    result.ok ? { status: "ok" } : { status: "error", reason: result.reason },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
