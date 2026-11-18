import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/contractors/change-password", () => ({ changeContractorPassword: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { POST } from "@/app/api/auth/change-password/route";
import { changeContractorPassword } from "@/lib/contractors/change-password";
import { getSession } from "@/lib/session";

type FakeSession = Record<string, unknown> & { save: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let session: FakeSession;

const contractor = {
  kind: "contractor" as const,
  id: "c-1",
  username: "90001",
  role: "user" as const,
  displayName: "สมชาย ใจดี",
  mustChangePassword: true,
};

beforeEach(() => {
  vi.mocked(changeContractorPassword).mockReset();
  session = Object.defineProperties({}, {
    save: { value: vi.fn() },
    destroy: { value: vi.fn() },
  }) as FakeSession;
  vi.mocked(getSession).mockResolvedValue(session as never);
});

const loggedIn = (user: Record<string, unknown> = contractor) => {
  session.user = user;
  session.isLoggedIn = true;
  session.loginAt = 1000;
};

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const good = { currentPassword: "Temp1234!", newPassword: "BrandNew-9876" };

describe("POST /api/auth/change-password", () => {
  it("401 without a session", async () => {
    session.isLoggedIn = false;
    const res = await POST(post(good));
    expect(res.status).toBe(401);
    expect(changeContractorPassword).not.toHaveBeenCalled();
  });

  it.each(["sso", "local"])("403 for a %s session", async (kind) => {
    loggedIn({ ...contractor, kind });
    const res = await POST(post(good));
    expect(res.status).toBe(403);
    expect(changeContractorPassword).not.toHaveBeenCalled();
  });

  it("400 on bad JSON or wrong shape", async () => {
    loggedIn();
    expect((await POST(post("{nope"))).status).toBe(400);
    expect((await POST(post({ currentPassword: 1 }))).status).toBe(400);
    expect(changeContractorPassword).not.toHaveBeenCalled();
  });

  it("200 and a fresh session with mustChangePassword false", async () => {
    loggedIn();
    session.stale = "x";
    vi.mocked(changeContractorPassword).mockResolvedValue({
      ok: true,
      user: { ...contractor, mustChangePassword: false },
    });
    const before = Date.now();
    const res = await POST(post(good));
    expect(res.status).toBe(200);
    expect((session.user as typeof contractor).mustChangePassword).toBe(false);
    expect(session.isLoggedIn).toBe(true);
    expect(session.loginAt as number).toBeGreaterThanOrEqual(before);
    expect(session).not.toHaveProperty("stale");
    expect(session.save).toHaveBeenCalledOnce();
    expect(vi.mocked(changeContractorPassword).mock.calls[0][0]).toMatchObject({
      userId: "c-1",
      currentPassword: good.currentPassword,
      newPassword: good.newPassword,
    });
  });

  it("429 with Retry-After when throttled", async () => {
    loggedIn();
    vi.mocked(changeContractorPassword).mockResolvedValue({
      ok: false,
      code: "TOO_MANY_ATTEMPTS",
      retryAfterSeconds: 42,
    });
    const res = await POST(post(good));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it.each([
    ["INVALID_CURRENT", 400],
    ["SAME_PASSWORD", 400],
    ["WEAK_PASSWORD", 400],
    ["NOT_ALLOWED", 403],
    ["SERVICE_UNAVAILABLE", 503],
  ] as const)("maps %s to %i without saving the session", async (code, status) => {
    loggedIn();
    vi.mocked(changeContractorPassword).mockResolvedValue({
      ok: false,
      code,
      ...(code === "WEAK_PASSWORD" ? { problem: "too_short" as const } : {}),
    });
    const res = await POST(post(good));
    expect(res.status).toBe(status);
    expect(session.save).not.toHaveBeenCalled();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(good.currentPassword);
    expect(text).not.toContain(good.newPassword);
  });

  it("never logs passwords when the service throws", async () => {
    loggedIn();
    vi.mocked(changeContractorPassword).mockRejectedValue(new Error(`bad ${good.newPassword}`));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post(good));
    expect(res.status).toBe(503);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(good.newPassword);
    expect(JSON.stringify(await res.json())).not.toContain(good.newPassword);
    spy.mockRestore();
  });
});
