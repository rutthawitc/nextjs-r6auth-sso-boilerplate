import { describe, expect, it } from "vitest";

import { PLACEHOLDER_SESSION_PASSWORD, assertSessionPassword, getSessionMaxMinutes, isSessionValid, isTrustProxy, sessionConfigFromEnv, type SessionData } from "@/lib/session-core";

const NOW = 1_700_000_000_000;
const MAX = 480;
const good: SessionData = {
  isLoggedIn: true,
  loginAt: NOW - 1000,
  user: { kind: "local", id: "1", username: "10001", role: "user", displayName: "X" },
};

describe("isSessionValid", () => {
  it("accepts a fresh session", () => {
    expect(isSessionValid(good, NOW, MAX)).toBe(true);
  });

  it("accepts exactly the maximum age, rejects older", () => {
    expect(isSessionValid({ ...good, loginAt: NOW - MAX * 60_000 }, NOW, MAX)).toBe(true);
    expect(isSessionValid({ ...good, loginAt: NOW - MAX * 60_000 - 1 }, NOW, MAX)).toBe(false);
  });

  it("accepts a contractor session and rejects an unknown kind", () => {
    const contractor = { ...good, user: { ...good.user!, kind: "contractor" as const, username: "90001", mustChangePassword: true } };
    expect(isSessionValid(contractor, NOW, MAX)).toBe(true);
    expect(isSessionValid({ ...good, user: { ...good.user!, kind: "other" as never } }, NOW, MAX)).toBe(false);
  });

  it("rejects a missing loginAt or kind (old cookie shape)", () => {
    expect(isSessionValid({ ...good, loginAt: undefined }, NOW, MAX)).toBe(false);
    expect(isSessionValid({ ...good, user: { ...good.user!, kind: undefined as never } }, NOW, MAX)).toBe(false);
    expect(isSessionValid({ ...good, loginAt: "x" as never }, NOW, MAX)).toBe(false);
    expect(isSessionValid({ ...good, loginAt: NaN }, NOW, MAX)).toBe(false);
  });

  it("rejects a loginAt in the future beyond 60s of skew", () => {
    expect(isSessionValid({ ...good, loginAt: NOW + 30_000 }, NOW, MAX)).toBe(true);
    expect(isSessionValid({ ...good, loginAt: NOW + 61_000 }, NOW, MAX)).toBe(false);
  });

  it("rejects when not logged in or without a user", () => {
    expect(isSessionValid({ ...good, isLoggedIn: false }, NOW, MAX)).toBe(false);
    expect(isSessionValid({ ...good, user: undefined }, NOW, MAX)).toBe(false);
    expect(isSessionValid({}, NOW, MAX)).toBe(false);
    expect(isSessionValid(null, NOW, MAX)).toBe(false);
  });
});

describe("sso sessions and expiresAt", () => {
  const sso: SessionData = {
    isLoggedIn: true,
    loginAt: NOW - 1000,
    expiresAt: NOW + 1000,
    user: { kind: "sso", id: "1", username: "10001", role: "user", displayName: "X" },
  };

  it("sso session valid before expiresAt", () => {
    expect(isSessionValid(sso, NOW, MAX)).toBe(true);
  });

  it("sso session invalid at expiresAt", () => {
    expect(isSessionValid({ ...sso, expiresAt: NOW }, NOW, MAX)).toBe(false);
  });

  it("sso session without expiresAt invalid", () => {
    expect(isSessionValid({ ...sso, expiresAt: undefined }, NOW, MAX)).toBe(false);
    expect(isSessionValid({ ...sso, expiresAt: NaN }, NOW, MAX)).toBe(false);
  });

  it("sso session still capped by the maximum lifetime", () => {
    expect(isSessionValid({ ...sso, loginAt: NOW - MAX * 60_000 - 1, expiresAt: NOW + 60_000 }, NOW, MAX)).toBe(false);
  });

  it('kind "ad" cookie invalid', () => {
    expect(isSessionValid({ ...sso, user: { ...sso.user!, kind: "ad" as never } }, NOW, MAX)).toBe(false);
  });

  it("local session ignores expiresAt absence", () => {
    expect(isSessionValid(good, NOW, MAX)).toBe(true);
  });
});

describe("session config", () => {
  it("defaults and parses SESSION_MAX_LIFETIME", () => {
    expect(getSessionMaxMinutes({})).toBe(480);
    expect(getSessionMaxMinutes({ SESSION_MAX_LIFETIME: "60" })).toBe(60);
    for (const v of ["abc", "0", "-1", "1.5"]) {
      expect(() => getSessionMaxMinutes({ SESSION_MAX_LIFETIME: v })).toThrow(/SESSION_MAX_LIFETIME/);
    }
  });

  it("parses TRUST_PROXY", () => {
    expect(isTrustProxy({})).toBe(false);
    expect(isTrustProxy({ TRUST_PROXY: "true" })).toBe(true);
    expect(isTrustProxy({ TRUST_PROXY: "1" })).toBe(true);
    expect(isTrustProxy({ TRUST_PROXY: "no" })).toBe(false);
  });
});

describe("assertSessionPassword", () => {
  const real = "x".repeat(48);

  it("accepts a real secret in every environment", () => {
    expect(assertSessionPassword(real, "production")).toBe(real);
    expect(assertSessionPassword(real, "development")).toBe(real);
  });

  it("rejects a missing or short secret", () => {
    expect(() => assertSessionPassword(undefined, "development")).toThrow(/at least 32/);
    expect(() => assertSessionPassword("short", "production")).toThrow(/at least 32/);
  });

  it("rejects the .env.example placeholder in production only", () => {
    expect(() => assertSessionPassword(PLACEHOLDER_SESSION_PASSWORD, "production")).toThrow(/openssl rand/);
    expect(assertSessionPassword(PLACEHOLDER_SESSION_PASSWORD, "development")).toBe(PLACEHOLDER_SESSION_PASSWORD);
    expect(assertSessionPassword(PLACEHOLDER_SESSION_PASSWORD, "test")).toBe(PLACEHOLDER_SESSION_PASSWORD);
  });
});

describe("sessionConfigFromEnv", () => {
  const PASSWORD = "x".repeat(32);
  it("reads password, cookie name and ttl", () => {
    expect(
      sessionConfigFromEnv({ IRON_SESSION_PASSWORD: PASSWORD, IRON_SESSION_COOKIE_NAME: "app_s", SESSION_MAX_LIFETIME: "60" }),
    ).toEqual({ password: PASSWORD, cookieName: "app_s", ttlSeconds: 3600 });
  });
  it("defaults the cookie name and lifetime", () => {
    expect(sessionConfigFromEnv({ IRON_SESSION_PASSWORD: PASSWORD })).toEqual({
      password: PASSWORD,
      cookieName: "pwa_auth_session",
      ttlSeconds: 480 * 60,
    });
  });
  it("refuses a short password and the placeholder in production", () => {
    expect(() => sessionConfigFromEnv({ IRON_SESSION_PASSWORD: "short" })).toThrow();
    expect(() =>
      sessionConfigFromEnv({ IRON_SESSION_PASSWORD: PLACEHOLDER_SESSION_PASSWORD, NODE_ENV: "production" }),
    ).toThrow(/placeholder/);
  });
});
