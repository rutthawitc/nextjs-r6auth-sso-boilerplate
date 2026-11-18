/**
 * Pure session types, config and validity rules. Safe for proxy.ts: it imports
 * nothing from the r6auth modules, next/headers or the database.
 */

export interface SessionUser {
  kind: "sso" | "local" | "contractor";
  id: string;
  username: string;
  role: "admin" | "user";
  displayName: string;
  firstName?: string;
  /** Contractor must set a new password before using the app. */
  mustChangePassword?: boolean;
}

export interface SessionData {
  user?: SessionUser;
  isLoggedIn: boolean;
  /** Epoch milliseconds of the login. The lifetime cap is absolute, not sliding. */
  loginAt?: number;
  /** Epoch milliseconds when the r6auth session ends (sso only). The app session never outlives it. */
  expiresAt?: number;
}

export const DEFAULT_SESSION_MAX_MINUTES = 480;
/** The sample value shipped in .env.example / .env.docker.example. Never valid in production. */
export const PLACEHOLDER_SESSION_PASSWORD = "change-me-to-a-random-string-of-at-least-32-chars";
/** Tolerated clock skew for a `loginAt` that lies in the future. */
export const CLOCK_SKEW_MS = 60_000;

function parseBool(value: string | undefined): boolean {
  const s = (value ?? "").trim().toLowerCase();
  return s === "true" || s === "1";
}

/** SESSION_MAX_LIFETIME in minutes (default 480). Throws on an invalid value. */
export function getSessionMaxMinutes(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.SESSION_MAX_LIFETIME ?? "").trim();
  if (raw === "") return DEFAULT_SESSION_MAX_MINUTES;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new Error("Invalid configuration: SESSION_MAX_LIFETIME must be a positive integer (minutes)");
  }
  return Number(raw);
}

/**
 * Session cookie settings from the environment. Lives here (not in session.ts)
 * so proxy.ts can read the cookie without importing next/headers.
 */
export function sessionConfigFromEnv(env: Record<string, string | undefined> = process.env): {
  password: string;
  cookieName: string;
  ttlSeconds: number;
} {
  return {
    password: assertSessionPassword(env.IRON_SESSION_PASSWORD, env.NODE_ENV),
    cookieName: env.IRON_SESSION_COOKIE_NAME || "pwa_auth_session",
    ttlSeconds: getSessionMaxMinutes(env) * 60,
  };
}

/**
 * TRUST_PROXY=true means a reverse proxy we control sets X-Forwarded-For /
 * X-Real-IP, so those headers may be used as the client address.
 */
export function isTrustProxy(env: Record<string, string | undefined> = process.env): boolean {
  return parseBool(env.TRUST_PROXY);
}

/** An r6auth session ends at `expiresAt` (epoch ms), with no clock-skew grace. Shared by login and isSessionValid. */
export function isSsoExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

/**
 * Whether the session data represents a live login. Old-shape cookies (no
 * `kind` or no `loginAt`) are invalid, as is anything older than the absolute
 * maximum lifetime or dated in the future (beyond a minute of clock skew).
 * SSO sessions additionally end at r6auth's `expiresAt`.
 */
export function isSessionValid(
  data: Partial<SessionData> | null | undefined,
  now: number,
  maxMinutes: number,
): boolean {
  if (!data || data.isLoggedIn !== true) return false;
  const user = data.user;
  if (!user || (user.kind !== "sso" && user.kind !== "local" && user.kind !== "contractor")) return false;
  const loginAt = data.loginAt;
  if (typeof loginAt !== "number" || !Number.isFinite(loginAt)) return false;
  const age = now - loginAt;
  if (age < -CLOCK_SKEW_MS) return false;
  if (age > maxMinutes * 60_000) return false;
  if (user.kind === "sso") {
    const expiresAt = data.expiresAt;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
    if (isSsoExpired(expiresAt, now)) return false;
  }
  return true;
}

/**
 * Startup check for IRON_SESSION_PASSWORD: it must exist, be at least 32
 * characters, and in production must not be the sample value from the
 * .env examples (anyone could forge session cookies with it).
 */
export function assertSessionPassword(password: string | undefined, nodeEnv: string | undefined): string {
  if (!password || password.length < 32) {
    throw new Error("IRON_SESSION_PASSWORD must be set and at least 32 characters long");
  }
  if (nodeEnv === "production" && password === PLACEHOLDER_SESSION_PASSWORD) {
    throw new Error(
      "IRON_SESSION_PASSWORD is still the placeholder from the .env example. Generate a real secret with: openssl rand -base64 48",
    );
  }
  return password;
}
