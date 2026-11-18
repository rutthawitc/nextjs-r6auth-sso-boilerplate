import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// attemptLogin itself is covered in tests/auth/login.test.ts; here we test the HTTP mapping.
vi.mock("@/lib/auth/login", () => ({ attemptLogin: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { attemptLogin } from "@/lib/auth/login";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { resetR6AuthConfigCache } from "@/lib/r6auth";
import { getSession } from "@/lib/session";

type FakeSession = Record<string, unknown> & { save: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let session: FakeSession;

beforeEach(() => {
  vi.mocked(attemptLogin).mockReset();
  // Like iron-session, save/destroy are non-enumerable so the route's key reset keeps them.
  session = Object.defineProperties({}, {
    save: { value: vi.fn() },
    destroy: { value: vi.fn() },
  }) as FakeSession;
  vi.mocked(getSession).mockResolvedValue(session as never);
});

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const user = {
  kind: "sso" as "sso" | "local" | "contractor",
  id: "u-1",
  username: "10001",
  displayName: "สมชาย ใจดี",
  role: "user" as const,
};

describe("POST /api/auth/login", () => {
  it("creates a fresh session with loginAt on success and drops stale fields", async () => {
    session.stale = "left over";
    vi.mocked(attemptLogin).mockResolvedValue({ ok: true, user } as never);
    const before = Date.now();

    const res = await login(post({ username: "10001", password: "password" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isLoggedIn: true, displayName: user.displayName, role: "user", kind: "sso" });
    expect(session.user).toEqual(user);
    expect(session.isLoggedIn).toBe(true);
    expect(session.loginAt).toBeGreaterThanOrEqual(before);
    expect(session).not.toHaveProperty("stale");
    expect(session.save).toHaveBeenCalledOnce();
    expect(session.destroy).not.toHaveBeenCalled();
  });

  it("stores a contractor session with mustChangePassword", async () => {
    const contractor = {
      kind: "contractor" as const,
      id: "c-1",
      username: "90001",
      displayName: "สมชาย ใจดี",
      role: "user" as const,
      mustChangePassword: true,
    };
    vi.mocked(attemptLogin).mockResolvedValue({ ok: true, user: contractor } as never);
    const res = await login(post({ username: "90001", password: "Temp1234!" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: "contractor", role: "user" });
    expect((session.user as typeof contractor).kind).toBe("contractor");
    expect((session.user as typeof contractor).mustChangePassword).toBe(true);
  });

  it("does not trust X-Forwarded-For by default (TRUST_PROXY off)", async () => {
    vi.mocked(attemptLogin).mockResolvedValue({ ok: false, code: "INVALID_CREDENTIALS" } as never);
    await login(post({ username: "10001", password: "x" }));
    expect(vi.mocked(attemptLogin).mock.calls[0][0]).toMatchObject({ username: "10001", password: "x" });
    expect(vi.mocked(attemptLogin).mock.calls[0][0].ip).not.toBe("203.0.113.9");
  });

  it.each([
    ["INVALID_CREDENTIALS", 401, AUTH_MESSAGES.invalid],
    ["SERVICE_UNAVAILABLE", 503, AUTH_MESSAGES.unavailable],
    ["INACTIVE", 403, AUTH_MESSAGES.inactive],
    ["CONTRACT_NOT_STARTED", 403, AUTH_MESSAGES.contractNotStarted],
    ["CONTRACT_ENDED", 403, AUTH_MESSAGES.contractEnded],
  ])("maps %s to %i and destroys the session", async (code, status, message) => {
    vi.mocked(attemptLogin).mockResolvedValue({ ok: false, code } as never);
    const res = await login(post({ username: "10001", password: "x" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: message, code });
    expect(session.destroy).toHaveBeenCalled();
    expect(session.save).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when throttled", async () => {
    vi.mocked(attemptLogin).mockResolvedValue({ ok: false, code: "TOO_MANY_ATTEMPTS", retryAfterSeconds: 42 } as never);
    const res = await login(post({ username: "10001", password: "x" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", retryAfterSeconds: 42 });
  });

  it("rejects a malformed body with 400 without calling attemptLogin", async () => {
    for (const body of ["not json", { username: "10001" }, { username: 1, password: "x" }]) {
      const res = await login(post(body));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_CREDENTIALS");
    }
    expect(attemptLogin).not.toHaveBeenCalled();
    expect(session.save).not.toHaveBeenCalled();
  });

  it("maps an unexpected throw to 503 without leaking the message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(attemptLogin).mockRejectedValue(new Error("secret internal detail"));
    const res = await login(post({ username: "10001", password: "x" }));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("secret internal detail");
    expect(JSON.parse(text)).toEqual({ error: AUTH_MESSAGES.unavailable, code: "SERVICE_UNAVAILABLE" });
    expect(session.destroy).toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  const ENV = {
    NODE_ENV: "production",
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
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetR6AuthConfigCache();
  });

  const loggedIn = (kind: "sso" | "local" | "contractor") => {
    session.isLoggedIn = true;
    session.user = { ...user, kind };
  };

  it("logout sso returns r6auth logout url", async () => {
    loggedIn("sso");
    const res = await logout();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      isLoggedIn: false,
      redirectTo:
        "https://r6.example/r6auth/logout.php?client_id=my-app&post_logout_redirect_uri=https%3A%2F%2Fmy-app.example%2Flogin",
    });
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it.each(["local", "contractor"] as const)("logout non-sso (%s) -> /login", async (kind) => {
    loggedIn(kind);
    expect(await (await logout()).json()).toEqual({ isLoggedIn: false, redirectTo: "/login" });
    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it("logout without a session -> /login", async () => {
    expect(await (await logout()).json()).toEqual({ isLoggedIn: false, redirectTo: "/login" });
  });

  it("logout sso in fake mode -> /login", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("R6AUTH_FAKE", "true");
    resetR6AuthConfigCache();
    loggedIn("sso");
    expect(await (await logout()).json()).toEqual({ isLoggedIn: false, redirectTo: "/login" });
  });

  it("logout sso with broken config -> /login", async () => {
    vi.stubEnv("R6AUTH_CLIENT_ID", "");
    resetR6AuthConfigCache();
    loggedIn("sso");
    expect(await (await logout()).json()).toEqual({ isLoggedIn: false, redirectTo: "/login" });
    expect(session.destroy).toHaveBeenCalledOnce();
  });
});
