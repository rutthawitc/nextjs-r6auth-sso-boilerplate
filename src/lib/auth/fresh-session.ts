/**
 * Replace everything in a session with a new login for `user`. Callers still
 * decide when to create it; this drops stale keys and stamps a new `loginAt`.
 */
import type { SessionUser } from "@/lib/session-core";

interface SavableSession {
  user?: SessionUser;
  isLoggedIn: boolean;
  loginAt?: number;
  expiresAt?: number;
  save(): Promise<void>;
}

export async function startFreshSession(
  session: SavableSession,
  user: SessionUser,
  opts: { expiresAt?: number } = {},
): Promise<void> {
  for (const key of Object.keys(session)) {
    delete (session as unknown as Record<string, unknown>)[key];
  }
  session.user = user;
  session.isLoggedIn = true;
  session.loginAt = Date.now();
  if (opts.expiresAt !== undefined) session.expiresAt = opts.expiresAt;
  await session.save();
}
