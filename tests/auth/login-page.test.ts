import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

import LoginPage from "@/app/login/page";
import { resetR6AuthConfigCache } from "@/lib/r6auth";

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const page = (await LoginPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement;
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, page));
}

describe("login page wording", () => {
  it("tells contractors to sign in with their contractor code", async () => {
    const html = await render();
    expect(html).toContain("ลูกจ้างใช้รหัสลูกจ้าง");
    expect(html).not.toContain("Active Directory");
  });

  it("still shows the contract-ended notice", async () => {
    expect(await render({ contract: "ended" })).toContain("สัญญาจ้าง");
  });
});

describe("SSO-first login page", () => {
  it("shows SSO link with encoded from", async () => {
    const html = await render({ from: "/admin/users?tab=1" });
    expect(html).toContain("เข้าสู่ระบบด้วยบัญชี กปภ.");
    expect(html).toContain('href="/api/auth/sso/login?from=%2Fadmin%2Fusers%3Ftab%3D1"');
  });

  it("drops an unsafe from from the SSO link", async () => {
    expect(await render({ from: "//evil.example" })).toContain('href="/api/auth/sso/login?from=%2Fprofile"');
  });

  it("maps error=NOT_ALLOWED to Thai message", async () => {
    expect(await render({ error: "NOT_ALLOWED" })).toContain("บัญชีของคุณไม่มีสิทธิ์ใช้งานระบบนี้");
    expect(await render({ error: "SSO_EXPIRED" })).toContain("ลิงก์เข้าสู่ระบบหมดอายุ");
  });

  it("ACCOUNT_CONFLICT tells the user to contact an administrator", async () => {
    const html = await render({ error: "ACCOUNT_CONFLICT" });
    expect(html).toContain("กรุณาติดต่อผู้ดูแลระบบ");
    expect(html).not.toContain("ไม่พร้อมใช้งานชั่วคราว");
  });

  it("ignores unknown error", async () => {
    const html = await render({ error: "<script>x</script>" });
    expect(html).not.toContain("script");
    expect(html).not.toContain('role="alert"');
  });

  it("keeps the password form in a collapsed section for contractors and admins", async () => {
    const html = await render();
    expect(html).toContain("ลูกจ้าง / ผู้ดูแลระบบ");
    expect(html).toContain("สำหรับลูกจ้างและผู้ดูแลระบบเท่านั้น พนักงาน กปภ. ใช้ปุ่มด้านบน");
    expect(html).toMatch(/<details(?![^>]*\bopen\b)[^>]*>/);
  });

  it("contract param opens the password section", async () => {
    expect(await render({ contract: "ended" })).toMatch(/<details[^>]*\bopen\b/);
  });
});

describe("SSO link points at the registered host", () => {
  const ENV = {
    R6AUTH_URL: "https://r6.example/r6auth",
    R6AUTH_CLIENT_ID: "my-app",
    R6AUTH_CLIENT_SECRET: "x",
    R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
    R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    resetR6AuthConfigCache();
  });

  it("uses the origin of R6AUTH_REDIRECT_URI, so the state cookie lands on the callback host", async () => {
    for (const [k, v] of Object.entries({ ...ENV, R6AUTH_FAKE: "false" })) vi.stubEnv(k, v);
    resetR6AuthConfigCache();
    expect(await render({ from: "/admin" })).toContain(
      'href="https://my-app.example/api/auth/sso/login?from=%2Fadmin"',
    );
  });

  it("stays relative in fake mode", async () => {
    for (const [k, v] of Object.entries({ ...ENV, R6AUTH_FAKE: "true" })) vi.stubEnv(k, v);
    resetR6AuthConfigCache();
    expect(await render()).toContain('href="/api/auth/sso/login?from=%2Fprofile"');
  });

  it("stays relative when the r6auth config is invalid (the login route reports it)", async () => {
    for (const [k, v] of Object.entries({ ...ENV, R6AUTH_FAKE: "false", R6AUTH_CLIENT_SECRET: "" })) vi.stubEnv(k, v);
    resetR6AuthConfigCache();
    expect(await render()).toContain('href="/api/auth/sso/login?from=%2Fprofile"');
  });
});
