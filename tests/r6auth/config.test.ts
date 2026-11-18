import { describe, expect, it } from "vitest";

import { isFakeActive, parseR6AuthConfig } from "@/lib/r6auth/config";

const base = {
  NODE_ENV: "production",
  R6AUTH_CLIENT_ID: "my-app",
  R6AUTH_CLIENT_SECRET: "s3cr3t-value",
  R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
  R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
};

describe("parseR6AuthConfig", () => {
  it("applies defaults", () => {
    const cfg = parseR6AuthConfig(base);
    expect(cfg).toEqual({
      url: "https://reg6apps.pwa.co.th/r6auth",
      clientId: "my-app",
      clientSecret: "s3cr3t-value",
      redirectUri: "https://my-app.example/api/auth/sso/callback",
      postLogoutRedirectUri: "https://my-app.example/login",
      allowedBa: [],
      timeoutMs: 10_000,
      fake: false,
    });
  });

  it("strips trailing slashes from the URL", () => {
    expect(parseR6AuthConfig({ ...base, R6AUTH_URL: "https://r6.example/r6auth//" }).url).toBe(
      "https://r6.example/r6auth",
    );
  });

  it("rejects an http URL when not fake", () => {
    expect(() => parseR6AuthConfig({ ...base, R6AUTH_URL: "http://r6.example/r6auth" })).toThrow(/R6AUTH_URL/);
  });

  it("names a missing secret without leaking any value", () => {
    let message = "";
    try {
      parseR6AuthConfig({ ...base, R6AUTH_CLIENT_SECRET: "" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("R6AUTH_CLIENT_SECRET");
    expect(message).not.toContain("my-app");
  });

  it("ignores R6AUTH_FAKE in production and then requires the secret", () => {
    expect(isFakeActive(true, "production")).toBe(false);
    expect(isFakeActive(true, "development")).toBe(true);
    expect(isFakeActive(true, "test")).toBe(true);
    expect(isFakeActive(false, "development")).toBe(false);
    expect(() => parseR6AuthConfig({ NODE_ENV: "production", R6AUTH_FAKE: "true" })).toThrow(/R6AUTH_CLIENT_ID/);
  });

  it("needs no secrets in fake mode during development", () => {
    const cfg = parseR6AuthConfig({ NODE_ENV: "development", R6AUTH_FAKE: "true" });
    expect(cfg.fake).toBe(true);
    expect(cfg.clientId).toBe("fake");
    expect(cfg.redirectUri).toBe("http://localhost:3000/api/auth/sso/callback");
    expect(cfg.postLogoutRedirectUri).toBe("http://localhost:3000/login");
  });

  it("parses the BA allow-list", () => {
    expect(parseR6AuthConfig({ ...base, R6AUTH_ALLOWED_BA: " 1059, ,1060" }).allowedBa).toEqual(["1059", "1060"]);
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects R6AUTH_TIMEOUT=%s", (value) => {
    expect(() => parseR6AuthConfig({ ...base, R6AUTH_TIMEOUT: value })).toThrow(/R6AUTH_TIMEOUT/);
  });

  it("parses R6AUTH_TIMEOUT in seconds", () => {
    expect(parseR6AuthConfig({ ...base, R6AUTH_TIMEOUT: "3" }).timeoutMs).toBe(3000);
  });
});
