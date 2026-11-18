import { describe, expect, it, vi } from "vitest";

import { checkSteps } from "../../scripts/r6auth-check";
import { parseR6AuthConfig } from "@/lib/r6auth/config";

const cfg = parseR6AuthConfig({
  NODE_ENV: "production",
  R6AUTH_URL: "https://r6.example/r6auth",
  R6AUTH_CLIENT_ID: "my-app",
  R6AUTH_CLIENT_SECRET: "TOPSECRET",
  R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
  R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
});

const fetchReturning = (impl: () => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch;

describe("checkSteps", () => {
  it("reports ok for ping 200 UP and lists the URLs to register", async () => {
    const f = fetchReturning(async () => new Response(JSON.stringify({ status: "UP" }), { status: 200 }));
    const steps = await checkSteps(cfg, f);
    expect(steps.every((s) => s.ok)).toBe(true);
    expect(vi.mocked(f).mock.calls[0][0]).toBe("https://r6.example/r6auth/ping.php");
    const text = JSON.stringify(steps);
    expect(text).toContain("https://my-app.example/api/auth/sso/callback");
    expect(text).toContain("https://my-app.example/login");
    expect(text).toContain("https://r6.example/r6auth/apps.php");
  });

  it("fails for 503 DOWN", async () => {
    const steps = await checkSteps(cfg, fetchReturning(async () => new Response('{"status":"DOWN"}', { status: 503 })));
    expect(steps.find((s) => s.name === "ping")?.ok).toBe(false);
  });

  it("fails for a network error", async () => {
    const steps = await checkSteps(cfg, fetchReturning(async () => { throw new TypeError("fetch failed"); }));
    expect(steps.find((s) => s.name === "ping")).toMatchObject({ ok: false });
  });

  it("output never contains the secret", async () => {
    const steps = await checkSteps(cfg, fetchReturning(async () => new Response('{"status":"UP"}')));
    expect(JSON.stringify(steps)).not.toContain("TOPSECRET");
    expect(JSON.stringify(steps)).toContain("set");
  });
});
