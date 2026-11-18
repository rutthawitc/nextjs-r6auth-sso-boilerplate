import type { NextRequest } from "next/server";

import { startFreshSession } from "@/lib/auth/fresh-session";
import { DEFAULT_POST_LOGIN_PATH, safeRedirectPath } from "@/lib/auth/redirect";
import { attemptSsoLogin, type SsoLoginFailureCode } from "@/lib/auth/sso-login";
import { SSO_STATE_COOKIE_PATH, readSsoState, ssoStateCookieName, statesMatch } from "@/lib/auth/sso-state";
import { getSession } from "@/lib/session";

import { relativeRedirect } from "../_redirect";

export const runtime = "nodejs";

/**
 * r6auth sends the browser back here with `code` and `state`. The state
 * cookie is single-use: it is cleared once its state has been used (matched)
 * and when it is unreadable. A callback whose state does not match belongs to
 * another tab or attempt, so the cookie is left for that attempt.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const redirectTo = (path: string, clearState = true) => {
    const response = relativeRedirect(path);
    if (clearState) response.cookies.set(ssoStateCookieName(), "", { path: SSO_STATE_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const toLogin = (code: SsoLoginFailureCode, clearState = true) => redirectTo(`/login?error=${code}`, clearState);

  const session = await getSession();

  // Reload / back button after a successful login: the code is already spent.
  if (session.isLoggedIn && session.user) return redirectTo(DEFAULT_POST_LOGIN_PATH);

  const rawCookie = request.cookies.get(ssoStateCookieName())?.value;
  const saved = await readSsoState(rawCookie);
  const code = params.get("code");
  const state = params.get("state");
  if (!saved) return toLogin("SSO_EXPIRED", rawCookie !== undefined);
  if (!state || !statesMatch(saved.state, state)) return toLogin("SSO_EXPIRED", false);
  if (!code || params.has("error")) return toLogin("SSO_EXPIRED");

  let result;
  try {
    result = await attemptSsoLogin({ code });
  } catch (error) {
    console.error("SSO login failed unexpectedly", error instanceof Error ? error.name : typeof error);
    session.destroy();
    return toLogin("SERVICE_UNAVAILABLE");
  }

  if (!result.ok) {
    session.destroy();
    return toLogin(result.code);
  }

  await startFreshSession(session, result.user, { expiresAt: result.expiresAt });
  return redirectTo(safeRedirectPath(saved.from));
}
