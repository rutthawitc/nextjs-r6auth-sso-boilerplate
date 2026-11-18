import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

const PASSWORD = "test-password-that-is-at-least-32-characters-long";
process.env.IRON_SESSION_PASSWORD = PASSWORD;
const COOKIE = "pwa_auth_session";

const { proxy } = await import("@/proxy");

const user = (over: Record<string, unknown> = {}) => ({
  kind: "contractor",
  id: "c-1",
  username: "90001",
  role: "user",
  displayName: "สมชาย ใจดี",
  ...over,
});

async function call(path: string, userOver?: Record<string, unknown> | null) {
  const headers = new Headers();
  if (userOver !== null && userOver !== undefined) {
    const sealed = await sealData(
      { user: user(userOver), isLoggedIn: true, loginAt: Date.now() },
      { password: PASSWORD },
    );
    headers.set("cookie", `${COOKIE}=${sealed}`);
  }
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
}

const location = (res: Response) => res.headers.get("location");

describe("proxy with mustChangePassword", () => {
  it.each(["/profile", "/admin/users"])("redirects %s to /change-password", async (path) => {
    const res = await call(path, { mustChangePassword: true });
    expect(res.status).toBe(307);
    expect(new URL(location(res)!).pathname).toBe("/change-password");
  });

  it("lets /change-password through", async () => {
    const res = await call("/change-password", { mustChangePassword: true });
    expect(location(res)).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a contractor without the flag use /profile and /change-password", async () => {
    expect(location(await call("/profile", { mustChangePassword: false }))).toBeNull();
    expect(location(await call("/change-password", {}))).toBeNull();
  });

  it("sends a visitor without a session from /change-password to /login", async () => {
    const res = await call("/change-password", null);
    expect(new URL(location(res)!).pathname).toBe("/login");
  });

  it("keeps non-admins out of /admin as before", async () => {
    const res = await call("/admin/users", { mustChangePassword: false });
    expect(new URL(location(res)!).pathname).toBe("/profile");
  });
});

describe("proxy.ts imports (edge-safe)", () => {
  it("imports only next/server, iron-session and session-core", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");
    const specifiers = [...source.matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(new Set(specifiers)).toEqual(new Set(["next/server", "iron-session", "@/lib/session-core"]));
  });
});
