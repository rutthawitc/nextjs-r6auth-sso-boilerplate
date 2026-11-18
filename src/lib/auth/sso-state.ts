/**
 * Short-lived, sealed cookie that carries the OAuth `state` and the post-login
 * path between /api/auth/sso/login and the callback. Separate from the main
 * session so starting a login never touches an existing one.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { sealData, unsealData } from "iron-session";

import { sessionOptions } from "@/lib/session";

export const SSO_STATE_TTL_SECONDS = 600;
export const SSO_STATE_COOKIE_PATH = "/api/auth/sso";

export interface SsoState {
  state: string;
  from: string;
}

export function ssoStateCookieName(): string {
  return `${sessionOptions.cookieName ?? "pwa_auth_session"}_sso`;
}

function password(): string {
  return sessionOptions.password as string;
}

export function sealSsoState(data: SsoState): Promise<string> {
  return sealData(data, { password: password(), ttl: SSO_STATE_TTL_SECONDS });
}

/** The sealed state, or null when missing, tampered with, expired or malformed. */
export async function readSsoState(sealed: string | undefined): Promise<SsoState | null> {
  if (!sealed) return null;
  try {
    const data = await unsealData<Partial<SsoState>>(sealed, { password: password(), ttl: SSO_STATE_TTL_SECONDS });
    if (typeof data?.state !== "string" || data.state === "" || typeof data.from !== "string") return null;
    return { state: data.state, from: data.from };
  } catch {
    return null;
  }
}

/** Constant-time comparison (hash first so lengths never leak). */
export function statesMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
