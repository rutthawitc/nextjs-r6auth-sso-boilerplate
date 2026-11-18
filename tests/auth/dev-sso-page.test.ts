import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import DevSsoPage from "@/app/dev/sso/page";
import { resetR6AuthConfigCache } from "@/lib/r6auth";

const render = async (state = "abc123") =>
  renderToStaticMarkup((await DevSsoPage({ searchParams: Promise.resolve({ state }) })) as ReactElement);

afterEach(() => {
  vi.unstubAllEnvs();
  resetR6AuthConfigCache();
});

describe("/dev/sso", () => {
  it("404 when fake inactive", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("R6AUTH_FAKE", "true");
    resetR6AuthConfigCache();
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists fake users with state in links", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("R6AUTH_FAKE", "true");
    resetR6AuthConfigCache();
    const html = await render("abc123");
    expect(html).toContain("r6auth จำลอง (เฉพาะการพัฒนา)");
    for (const u of ["10001", "10002", "10003", "down"]) {
      expect(html).toContain(`href="/api/auth/sso/callback?code=fake%3A${u}&amp;state=abc123"`);
    }
    expect(html).toContain("สมชาย");
  });
});
