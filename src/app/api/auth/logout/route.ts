import { createSuccessResponse } from "@/lib/api-response";
import { buildLogoutUrl, getR6AuthConfig } from "@/lib/r6auth";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Ends the app session. SSO users are then sent to r6auth's logout.php (which
 * also ends the central Keycloak session); everyone else goes to /login.
 */
export async function POST() {
  const session = await getSession();
  const kind = session.isLoggedIn ? session.user?.kind : undefined;
  await session.destroy();

  let redirectTo = "/login";
  if (kind === "sso") {
    try {
      const cfg = getR6AuthConfig();
      if (!cfg.fake) redirectTo = buildLogoutUrl(cfg);
    } catch (error) {
      console.error("r6auth configuration invalid", error instanceof Error ? error.message : typeof error);
    }
  }

  return createSuccessResponse({ isLoggedIn: false, redirectTo });
}
