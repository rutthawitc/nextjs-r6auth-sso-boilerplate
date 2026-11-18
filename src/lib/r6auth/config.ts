/**
 * r6auth settings from the environment, parsed lazily and cached. Error
 * messages name the variable, never its value.
 */
export interface R6AuthConfig {
  url: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  /** BA codes allowed to sign in; empty admits everyone r6auth accepts. */
  allowedBa: string[];
  timeoutMs: number;
  /** True only when R6AUTH_FAKE is set and NODE_ENV is development or test. */
  fake: boolean;
}

export const DEFAULT_R6AUTH_URL = "https://reg6apps.pwa.co.th/r6auth";
const FAKE_DEFAULTS = {
  clientId: "fake",
  clientSecret: "fake",
  redirectUri: "http://localhost:3000/api/auth/sso/callback",
  postLogoutRedirectUri: "http://localhost:3000/login",
};

/** The fake r6auth is honoured only in development and test, never in production. */
export function isFakeActive(fakeFlag: boolean, nodeEnv: string | undefined): boolean {
  return fakeFlag && (nodeEnv === "development" || nodeEnv === "test");
}

function parseBool(value: string | undefined): boolean {
  const s = (value ?? "").trim().toLowerCase();
  return s === "true" || s === "1";
}

function invalid(name: string, rule: string): Error {
  return new Error(`Invalid configuration: ${name} ${rule}`);
}

function parseUrl(name: string, raw: string, requireHttps: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw invalid(name, "must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && !requireHttps)) {
    throw invalid(name, requireHttps ? "must use https://" : "must use http:// or https://");
  }
  return raw;
}

export function parseR6AuthConfig(env: Record<string, string | undefined>): R6AuthConfig {
  const fake = isFakeActive(parseBool(env.R6AUTH_FAKE), env.NODE_ENV);
  const get = (name: string) => (env[name] ?? "").trim();

  const url = parseUrl("R6AUTH_URL", get("R6AUTH_URL") || DEFAULT_R6AUTH_URL, !fake).replace(/\/+$/, "");

  const required = (name: string, fallback: string) => {
    const value = get(name);
    if (value) return value;
    if (fake) return fallback;
    throw invalid(name, "must be set");
  };
  const clientId = required("R6AUTH_CLIENT_ID", FAKE_DEFAULTS.clientId);
  const clientSecret = required("R6AUTH_CLIENT_SECRET", FAKE_DEFAULTS.clientSecret);
  const redirectUri = parseUrl(
    "R6AUTH_REDIRECT_URI",
    required("R6AUTH_REDIRECT_URI", FAKE_DEFAULTS.redirectUri),
    false,
  );
  const postLogoutRedirectUri = parseUrl(
    "R6AUTH_POST_LOGOUT_REDIRECT_URI",
    required("R6AUTH_POST_LOGOUT_REDIRECT_URI", FAKE_DEFAULTS.postLogoutRedirectUri),
    false,
  );

  const allowedBa = get("R6AUTH_ALLOWED_BA")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const rawTimeout = get("R6AUTH_TIMEOUT");
  let timeoutMs = 10_000;
  if (rawTimeout !== "") {
    if (!/^\d+$/.test(rawTimeout) || Number(rawTimeout) <= 0) {
      throw invalid("R6AUTH_TIMEOUT", "must be a positive integer (seconds)");
    }
    timeoutMs = Number(rawTimeout) * 1000;
  }

  return { url, clientId, clientSecret, redirectUri, postLogoutRedirectUri, allowedBa, timeoutMs, fake };
}

let cached: R6AuthConfig | null = null;

export function getR6AuthConfig(): R6AuthConfig {
  cached ??= parseR6AuthConfig(process.env);
  return cached;
}

export function resetR6AuthConfigCache(): void {
  cached = null;
}
