import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

import {
  getSessionMaxMinutes,
  isSessionValid,
  sessionConfigFromEnv,
  type SessionData,
  type SessionUser,
} from "@/lib/session-core";

export { isSessionValid, type SessionData, type SessionUser } from "@/lib/session-core";

const sessionConfig = sessionConfigFromEnv();

const maxMinutes = getSessionMaxMinutes();

export const sessionOptions: SessionOptions = {
  password: sessionConfig.password,
  cookieName: sessionConfig.cookieName,
  // Defence in depth: the sealed cookie itself expires with the maximum
  // lifetime (seconds), in addition to the explicit loginAt check.
  ttl: sessionConfig.ttlSeconds,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

/**
 * The current session. A cookie that is present but no longer valid (expired,
 * or from an older cookie shape) is reported as logged out. Nothing is saved
 * or destroyed here: server components cannot set cookies. proxy.ts and the
 * login route remove stale cookies.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    sessionOptions,
  );
  if (!isSessionValid(session, Date.now(), maxMinutes)) {
    session.user = undefined;
    session.isLoggedIn = false;
    session.loginAt = undefined;
  }
  return session;
}

/** The signed-in user from a valid session, or null. */
export async function getValidSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.isLoggedIn && session.user ? session.user : null;
}
