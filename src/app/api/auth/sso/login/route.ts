import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { SSO_STATE_COOKIE_PATH, SSO_STATE_TTL_SECONDS, sealSsoState, ssoStateCookieName } from "@/lib/auth/sso-state";
import { buildAuthorizeUrl, getR6AuthConfig, type R6AuthConfig } from "@/lib/r6auth";

import { relativeRedirect } from "../_redirect";

export const runtime = "nodejs";

/** Starts an r6auth login: remember state + destination, then send the browser to authorize.php. */
export async function GET(request: NextRequest) {
  let cfg: R6AuthConfig;
  try {
    cfg = getR6AuthConfig();
  } catch (error) {
    console.error("r6auth configuration invalid", error instanceof Error ? error.message : typeof error);
    return relativeRedirect("/login?error=SERVICE_UNAVAILABLE");
  }

  const state = randomBytes(32).toString("hex");
  const from = safeRedirectPath(request.nextUrl.searchParams.get("from"));

  const response = cfg.fake
    ? relativeRedirect(`/dev/sso?${new URLSearchParams({ state })}`)
    : NextResponse.redirect(buildAuthorizeUrl(cfg, state));
  response.cookies.set(ssoStateCookieName(), await sealSsoState({ state, from }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: SSO_STATE_COOKIE_PATH,
    maxAge: SSO_STATE_TTL_SECONDS,
  });
  return response;
}
