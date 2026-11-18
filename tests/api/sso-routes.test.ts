import { NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "test-session-password-at-least-32-characters!";
vi.mock("@/lib/auth/sso-login", () => ({ attemptSsoLogin: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  sessionOptions: { password: "test-session-password-at-least-32-characters!", cookieName: "pwa_auth_session" },
}));

import { GET as callback } from "@/app/api/auth/sso/callback/route";
import { GET as ssoLogin } from "@/app/api/auth/sso/login/route";
import { attemptSsoLogin } from "@/lib/auth/sso-login";
import { sealSsoState } from "@/lib/auth/sso-state";
import { resetR6AuthConfigCache } from "@/lib/r6auth";
import { getSession } from "@/lib/session";

type FakeSession = Record<string, unknown> & { save: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let session: FakeSession;
const COOKIE = "pwa_auth_session_sso";

const ENV = {
  R6AUTH_URL: "https://r6.example/r6auth",
  R6AUTH_CLIENT_ID: "my-app",
  R6AUTH_CLIENT_SECRET: "x",
  R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
  R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
  R6AUTH_FAKE: "false",
};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  resetR6AuthConfigCache();
  vi.mocked(attemptSsoLogin).mockReset();
  session = Object.defineProperties({ isLoggedIn: false }, {
    save: { value: vi.fn() },
    destroy: { value: vi.fn() },
  }) as unknown as FakeSession;
  vi.mocked(getSession).mockResolvedValue(session as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetR6AuthConfigCache();
});

const get = (path: string, cookie?: string) =>
  new NextRequest(`https://my-app.example${path}`, cookie ? { headers: { cookie: `${COOKIE}=${cookie}` } } : {});

const location = (res: Response) => new URL(res.headers.get("location") ?? "", "https://my-app.example");

const stateCookie = (res: Response) => {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`)) ?? "";
  return { header, value: decodeURIComponent(header.slice(COOKIE.length + 1).split(";")[0]) };
};

const unseal = (value: string) => unsealData<{ state: string; from: string }>(value, { password: PASSWORD });

const ssoUser = { kind: "sso" as const, id: "u-1", username: "10001", displayName: "สมชาย ใจดี", role: "user" as const };

describe("GET /api/auth/sso/login", () => {
  it("sets sealed state cookie and redirects to authorize.php", async () => {
    const res = await ssoLogin(get("/api/auth/sso/login?from=/admin/users"));
    expect(res.status).toBe(307);
    const loc = location(res);
    expect(loc.origin + loc.pathname).toBe("https://r6.example/r6auth/authorize.php");
    const state = loc.searchParams.get("state");
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(loc.searchParams.get("client_id")).toBe("my-app");
    const { header, value } = stateCookie(res);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Path=\/api\/auth\/sso/);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Max-Age=600/);
    expect(await unseal(value)).toEqual({ state, from: "/admin/users" });
  });

  it("sanitises from", async () => {
    for (const from of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const res = await ssoLogin(get(`/api/auth/sso/login?from=${encodeURIComponent(from)}`));
      expect((await unseal(stateCookie(res).value)).from).toBe("/profile");
    }
  });

  it("redirects to /dev/sso in fake mode", async () => {
    vi.stubEnv("R6AUTH_FAKE", "true");
    resetR6AuthConfigCache();
    const res = await ssoLogin(get("/api/auth/sso/login"));
    const loc = location(res);
    expect(loc.pathname).toBe("/dev/sso");
    expect(loc.searchParams.get("state")).toBe((await unseal(stateCookie(res).value)).state);
  });

  it("config error -> /login?error=SERVICE_UNAVAILABLE", async () => {
    vi.stubEnv("R6AUTH_CLIENT_SECRET", "");
    resetR6AuthConfigCache();
    const res = await ssoLogin(get("/api/auth/sso/login"));
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("error")).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("GET /api/auth/sso/callback", () => {
  const sealed = (state = "a".repeat(64), from = "/admin/users") => sealSsoState({ state, from });

  const expectCleared = (res: Response) => {
    const { header } = stateCookie(res);
    expect(header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  };

  it("success creates session with expiresAt and redirects to from", async () => {
    vi.mocked(attemptSsoLogin).mockResolvedValue({ ok: true, user: ssoUser, expiresAt: 1_900_000_000_000 });
    session.stale = "x";
    const res = await callback(get(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealed()));
    expect(location(res).pathname).toBe("/admin/users");
    expect(attemptSsoLogin).toHaveBeenCalledWith({ code: "C1" });
    expect(session).toMatchObject({ isLoggedIn: true, user: ssoUser, expiresAt: 1_900_000_000_000 });
    expect(session.stale).toBeUndefined();
    expect(typeof session.loginAt).toBe("number");
    expect(session.save).toHaveBeenCalledOnce();
    expectCleared(res);
  });

  // cleared: the cookie's state was used (matched) or is unreadable. A
  // mismatch or a missing state belongs to another tab: keep its cookie.
  it.each([
    ["state mismatch never exchanges", `?code=C1&state=${"b".repeat(64)}`, true, "kept"],
    ["missing cookie", `?code=C1&state=${"a".repeat(64)}`, false, "kept"],
    ["missing code", `?state=${"a".repeat(64)}`, true, "cleared"],
    ["missing state", `?code=C1`, true, "kept"],
    ["error query", `?error=access_denied&state=${"a".repeat(64)}`, true, "cleared"],
    ["error query for another tab", `?error=access_denied&state=${"b".repeat(64)}`, true, "kept"],
  ])("%s -> SSO_EXPIRED", async (_name, query, withCookie, cookie) => {
    const res = await callback(get(`/api/auth/sso/callback${query}`, withCookie ? await sealed() : undefined));
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("error")).toBe("SSO_EXPIRED");
    expect(attemptSsoLogin).not.toHaveBeenCalled();
    if (cookie === "cleared") expectCleared(res);
    else expect(stateCookie(res).header).toBe("");
  });

  it("two tabs: the older tab's callback leaves the newer tab's state cookie, which still logs in", async () => {
    // Tab A started first; tab B's login overwrote the cookie with state B.
    const cookieB = await sealed("b".repeat(64), "/profile");
    const resA = await callback(get(`/api/auth/sso/callback?code=CA&state=${"a".repeat(64)}`, cookieB));
    expect(location(resA).searchParams.get("error")).toBe("SSO_EXPIRED");
    expect(stateCookie(resA).header).toBe("");

    vi.mocked(attemptSsoLogin).mockResolvedValue({ ok: true, user: ssoUser, expiresAt: 1_900_000_000_000 });
    const resB = await callback(get(`/api/auth/sso/callback?code=CB&state=${"b".repeat(64)}`, cookieB));
    expect(location(resB).pathname).toBe("/profile");
    expect(attemptSsoLogin).toHaveBeenCalledWith({ code: "CB" });
    expectCleared(resB);
  });

  it("tampered cookie -> SSO_EXPIRED", async () => {
    const res = await callback(get(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, "garbage"));
    expect(location(res).searchParams.get("error")).toBe("SSO_EXPIRED");
    expect(attemptSsoLogin).not.toHaveBeenCalled();
    expectCleared(res);
  });

  it("already logged in redirects to /profile without exchange", async () => {
    session.isLoggedIn = true;
    session.user = ssoUser;
    const res = await callback(get(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealed()));
    expect(location(res).pathname).toBe("/profile");
    expect(attemptSsoLogin).not.toHaveBeenCalled();
    expectCleared(res);
  });

  it.each(["SSO_EXPIRED", "SERVICE_UNAVAILABLE", "NOT_ALLOWED", "INACTIVE", "PENDING_APPROVAL", "REJECTED", "ACCOUNT_CONFLICT"] as const)(
    "failure %s -> /login?error and session destroyed",
    async (code) => {
      vi.mocked(attemptSsoLogin).mockResolvedValue({ ok: false, code });
      const res = await callback(get(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealed()));
      expect(location(res).pathname).toBe("/login");
      expect(location(res).searchParams.get("error")).toBe(code);
      expect(session.destroy).toHaveBeenCalled();
      expect(session.save).not.toHaveBeenCalled();
    },
  );

  it("unexpected throw -> SERVICE_UNAVAILABLE", async () => {
    vi.mocked(attemptSsoLogin).mockRejectedValue(new Error("boom"));
    const res = await callback(get(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealed()));
    expect(location(res).searchParams.get("error")).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("redirects behind a proxy / in Docker (request.url is the bind address)", () => {
  const bound = (path: string, cookie?: string) =>
    new NextRequest(`http://0.0.0.0:3000${path}`, cookie ? { headers: { cookie: `${COOKIE}=${cookie}` } } : {});
  const raw = (res: Response) => res.headers.get("location") ?? "";

  it("callback redirects are relative, never to 0.0.0.0", async () => {
    const bad = await callback(bound(`/api/auth/sso/callback?code=C1&state=x`));
    expect(raw(bad)).toBe("/login?error=SSO_EXPIRED");
    vi.mocked(attemptSsoLogin).mockResolvedValue({ ok: true, user: ssoUser, expiresAt: 1_900_000_000_000 });
    const ok = await callback(
      bound(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealSsoState({ state: "a".repeat(64), from: "/admin/users" })),
    );
    expect(raw(ok)).toBe("/admin/users");
  });

  it.each(["//evil.example", "https://evil.example"])("callback never follows a hostile from %s", async (from) => {
    vi.mocked(attemptSsoLogin).mockResolvedValue({ ok: true, user: ssoUser, expiresAt: 1_900_000_000_000 });
    const res = await callback(
      bound(`/api/auth/sso/callback?code=C1&state=${"a".repeat(64)}`, await sealSsoState({ state: "a".repeat(64), from })),
    );
    expect(raw(res)).toBe("/profile");
  });

  it("sso login error and fake redirects are relative", async () => {
    vi.stubEnv("R6AUTH_CLIENT_SECRET", "");
    resetR6AuthConfigCache();
    expect(raw(await ssoLogin(bound("/api/auth/sso/login")))).toBe("/login?error=SERVICE_UNAVAILABLE");
    vi.stubEnv("R6AUTH_FAKE", "true");
    resetR6AuthConfigCache();
    expect(raw(await ssoLogin(bound("/api/auth/sso/login")))).toMatch(/^\/dev\/sso\?state=[0-9a-f]{64}$/);
  });
});

